import { AlertCircle, Check, ChevronDown, RefreshCw } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { scoresApi } from '../api/services';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { StatusMessage } from '../components/StatusMessage';
import type { Criterion, Family, Score, ScoreContext } from '../types';
import { getErrorMessage } from '../utils/errors';

type ScoreMap = Record<string, Score>;

const scoreKey = (familyId: string, criterionId: string) =>
  `${familyId}:${criterionId}`;

export function ScoresPage() {
  const { user } = useAuth();
  const [scores, setScores] = useState<Score[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [cycle, setCycle] = useState<ScoreContext['scoringCycle'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [scoreData, context] = await Promise.all([
        scoresApi.list(),
        scoresApi.context(),
      ]);
      setScores(scoreData);
      setCycle(context.scoringCycle);
      setFamilies(context.families);
      setCriteria(context.criteria);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleReset = () => {
      void load();
    };

    window.addEventListener('scores:reset', handleReset);
    return () => window.removeEventListener('scores:reset', handleReset);
  }, [load]);

  const scoreMap = useMemo(
    () =>
      scores.reduce<ScoreMap>((map, score) => {
        map[scoreKey(score.familyId, score.criterionId)] = score;
        return map;
      }, {}),
    [scores],
  );

  const groupedCriteria = useMemo(() => {
    const groups = new Map<
      string,
      { id: string; name: string; criteria: Criterion[] }
    >();

    for (const criterion of criteria) {
      const group = groups.get(criterion.committee.id) ?? {
        id: criterion.committee.id,
        name: criterion.committee.name,
        criteria: [],
      };
      group.criteria.push(criterion);
      groups.set(criterion.committee.id, group);
    }

    return Array.from(groups.values()).map((group) => ({
      ...group,
      criteria: group.criteria.sort(
        (first, second) =>
          first.displayOrder - second.displayOrder ||
          first.title.localeCompare(second.title),
      ),
    }));
  }, [criteria]);

  const saveScore = async (
    family: Family,
    criterion: Criterion,
    rawValue: string,
  ) => {
    const key = scoreKey(family.id, criterion.id);
    const existing = scoreMap[key];

    if (rawValue === '') {
      if (!existing) return;
      setSavingKey(key);
      try {
        await scoresApi.remove(existing.id);
        setScores((current) => current.filter((score) => score.id !== existing.id));
        setSavedKey(key);
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      } finally {
        setSavingKey('');
      }
      return;
    }

    const value = normalizeScore(rawValue, criterion.maxScore);

    if (value === null) {
      setError('تعذر قراءة قيمة الدرجة.');
      return;
    }

    if (!cycle) {
      return;
    }
    if (existing && Number(existing.score) === value) return;

    setSavingKey(key);
    setError('');
    try {
      const saved = existing
        ? await scoresApi.update(existing.id, { score: value })
        : await scoresApi.create({
            scoringCycleId: cycle.id,
            familyId: family.id,
            criterionId: criterion.id,
            score: value,
          });

      setScores((current) => {
        const withoutSaved = current.filter((score) => score.id !== saved.id);
        return [...withoutSaved, saved];
      });
      setSavedKey(key);
      window.setTimeout(() => setSavedKey(''), 1300);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSavingKey('');
    }
  };

  if (loading) {
    return <div className="py-24 text-center text-slate-500">جارٍ تحميل الدرجات...</div>;
  }

  return (
    <>
      <PageHeader
        title="إدخال الدرجات"
        subtitle={cycle ? `${cycle.name} · ${user?.committee?.name ?? 'جميع اللجان'}` : user?.committee?.name ?? 'جميع اللجان'}
        action={
          <button className="btn-secondary" onClick={() => void load()}>
            <RefreshCw size={17} />
            تحديث
          </button>
        }
      />

      {error && <StatusMessage message={error} />}

      {families.length === 0 || criteria.length === 0 ? (
        <div className="border border-slate-200 bg-white px-6 py-16 text-center">
          <AlertCircle className="mx-auto mb-4 text-slate-400" size={34} />
          <h2 className="font-bold text-primary">لا توجد بيانات درجات متاحة</h2>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedCriteria.map((group) => (
            <section key={group.id}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-primary">{group.name}</h2>
                <span className="text-xs text-slate-500">
                  {group.criteria.length} معيار
                </span>
              </div>

              <div className="hidden overflow-auto border border-slate-200 bg-white md:block">
                <table className="min-w-max border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky right-0 top-0 z-30 w-[420px] min-w-[420px] border-b border-l border-slate-200 bg-primary px-5 py-4 text-right text-white">
                        المعيار ووصفه
                      </th>
                      {families.map((family) => (
                        <th
                          key={family.id}
                          className="sticky top-0 z-20 w-32 min-w-32 border-b border-l border-slate-200 bg-primary px-3 py-3 text-center text-white"
                        >
                          <div>{family.name}</div>
                          <div className="mt-1 text-[11px] font-normal text-white/65">
                            {family.stage.name}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.criteria.map((criterion) => (
                      <tr key={criterion.id}>
                        <td className="sticky right-0 z-10 w-[420px] min-w-[420px] border-b border-l border-slate-200 bg-slate-50 px-5 py-5 align-top">
                          <div className="flex items-start justify-between gap-4">
                            <div className="text-base font-bold leading-7 text-primary">
                              {criterion.title}
                            </div>
                            <span className="min-w-max bg-primary/8 px-2.5 py-1 text-xs font-bold text-primary">
                              من {Number(criterion.maxScore).toFixed(2)}
                            </span>
                          </div>
                          <div className="mt-3 whitespace-pre-wrap break-words border-t border-slate-200 pt-3 text-sm leading-7 text-slate-700">
                            {criterion.description?.trim() ||
                              'لا يوجد وصف مسجل لهذا المعيار.'}
                          </div>
                        </td>
                        {families.map((family) => (
                          <td
                            key={family.id}
                            className="border-b border-l border-slate-200 p-2 text-center"
                          >
                            <ScoreInput
                              family={family}
                              criterion={criterion}
                              score={scoreMap[scoreKey(family.id, criterion.id)]}
                              saving={savingKey === scoreKey(family.id, criterion.id)}
                              saved={savedKey === scoreKey(family.id, criterion.id)}
                              onSave={saveScore}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-accent/20 font-bold">
                      <td className="sticky right-0 z-10 border-l border-slate-200 bg-accent/30 px-4 py-3">
                        مجموع القسم
                      </td>
                      {families.map((family) => (
                        <td key={family.id} className="border-l border-slate-200 px-3 py-3 text-center text-primary">
                          {group.criteria
                            .reduce(
                              (sum, criterion) =>
                                sum +
                                Number(
                                  scoreMap[scoreKey(family.id, criterion.id)]
                                    ?.score ?? 0,
                                ),
                              0,
                            )
                            .toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {group.criteria.map((criterion) => (
                  <article
                    key={criterion.id}
                    className="border border-slate-200 bg-white p-4"
                    style={{ borderRadius: 8 }}
                  >
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div className="text-base font-bold leading-7 text-primary">
                        {criterion.title}
                      </div>
                      <span className="min-w-max text-xs text-slate-500">
                        من {Number(criterion.maxScore).toFixed(2)}
                      </span>
                    </div>
                    <div className="mb-5 whitespace-pre-wrap break-words border-y border-slate-100 bg-slate-50 px-3 py-4 text-sm leading-7 text-slate-700">
                      {criterion.description?.trim() ||
                        'لا يوجد وصف مسجل لهذا المعيار.'}
                    </div>
                    <div className="grid gap-3">
                      {families.map((family) => (
                        <div key={family.id} className="grid grid-cols-[1fr_100px] items-center gap-3">
                          <div>
                            <div className="text-sm font-semibold">{family.name}</div>
                            <div className="text-xs text-slate-500">{family.stage.name}</div>
                          </div>
                          <ScoreInput
                            family={family}
                            criterion={criterion}
                            score={scoreMap[scoreKey(family.id, criterion.id)]}
                            saving={savingKey === scoreKey(family.id, criterion.id)}
                            saved={savedKey === scoreKey(family.id, criterion.id)}
                            onSave={saveScore}
                          />
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function ScoreInput({
  family,
  criterion,
  score,
  saving,
  saved,
  onSave,
}: {
  family: Family;
  criterion: Criterion;
  score?: Score;
  saving: boolean;
  saved: boolean;
  onSave: (family: Family, criterion: Criterion, value: string) => Promise<void>;
}) {
  const maxScore = Math.max(0, Math.floor(Number(criterion.maxScore)));
  const options = Array.from({ length: maxScore + 1 }, (_, index) => index);
  const optionValues = ['', ...options.map(String)];
  const triggerRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    width: 70,
  });
  const [value, setValue] = useState(
    score ? String(normalizeScore(score.score, maxScore) ?? '') : '',
  );

  useEffect(() => {
    setValue(score ? String(normalizeScore(score.score, maxScore) ?? '') : '');
  }, [score, maxScore]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const closeOnExternalScroll = (event: Event) => {
      const target = event.target;

      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('resize', closeOnExternalScroll);
    window.addEventListener('scroll', closeOnExternalScroll, true);

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('resize', closeOnExternalScroll);
      window.removeEventListener('scroll', closeOnExternalScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    menuRef.current?.focus();
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const openMenu = (preferredIndex?: number) => {
    if (saving || !triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = Math.min(optionValues.length * 32 + 8, 200);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < menuHeight && rect.top > spaceBelow;
    const top = openAbove
      ? Math.max(8, rect.top - menuHeight - 4)
      : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 4);
    const selectedIndex = optionValues.indexOf(value);

    setMenuPosition({
      top,
      left: Math.min(window.innerWidth - 78, Math.max(8, rect.left)),
      width: 70,
    });
    setActiveIndex(
      preferredIndex ?? (selectedIndex >= 0 ? selectedIndex : 0),
    );
    setOpen(true);
  };

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
    } else {
      openMenu();
    }
  };

  const selectValue = (selectedValue: string) => {
    setValue(selectedValue);
    setOpen(false);
    void onSave(family, criterion, selectedValue);
  };

  const handleKeyboard = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openMenu(
          event.key === 'ArrowUp' ? optionValues.length - 1 : undefined,
        );
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) =>
        Math.min(optionValues.length - 1, index + 1),
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(optionValues.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectValue(optionValues[activeIndex]);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false);
      if (event.key === 'Escape') {
        event.preventDefault();
        if (window.matchMedia('(min-width: 768px)').matches) {
          desktopInputRef.current?.focus();
        } else {
          mobileButtonRef.current?.focus();
        }
      }
    }
  };

  const commitTypedValue = () => {
    if (value === '') {
      void onSave(family, criterion, '');
      return;
    }

    const normalized = normalizeScore(value, maxScore);

    if (normalized === null) {
      setValue(score ? String(normalizeScore(score.score, maxScore) ?? '') : '');
      return;
    }

    const normalizedValue = String(normalized);
    setValue(normalizedValue);
    void onSave(family, criterion, normalizedValue);
  };

  return (
    <div ref={triggerRef} className="relative mx-auto w-[70px]">
      <div className="relative hidden md:block">
        <input
          ref={desktopInputRef}
          type="text"
          inputMode="numeric"
          className={`h-[34px] w-[70px] border bg-white px-5 text-center text-sm font-bold text-primary outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/25 disabled:cursor-wait disabled:opacity-60 ${
            saved
              ? 'border-emerald-400 bg-emerald-50'
              : 'border-slate-300 hover:border-primary/40'
          }`}
          style={{ borderRadius: 12 }}
          value={value}
          disabled={saving}
          placeholder="—"
          aria-label={`درجة ${family.name} في ${criterion.title}`}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commitTypedValue}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              setValue(
                score
                  ? String(normalizeScore(score.score, maxScore) ?? '')
                  : '',
              );
              event.currentTarget.blur();
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              openMenu();
            }
          }}
        />
        <button
          type="button"
          className="absolute left-0 top-0 flex h-[34px] w-6 items-center justify-center text-slate-500 hover:text-primary"
          aria-label={`فتح قائمة درجات ${criterion.title}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleMenu}
        >
          <ChevronDown
            size={14}
            className={`transition ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      <button
        ref={mobileButtonRef}
        type="button"
        className={`relative h-11 w-[70px] border bg-white px-5 text-center text-sm font-bold text-primary outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/25 disabled:cursor-wait disabled:opacity-60 md:hidden ${
          saved
            ? 'border-emerald-400 bg-emerald-50'
            : 'border-slate-300 active:bg-slate-50'
        }`}
        style={{ borderRadius: 12 }}
        disabled={saving}
        aria-label={`درجة ${family.name} في ${criterion.title}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleMenu}
        onKeyDown={handleKeyboard}
      >
        {value || '—'}
        <ChevronDown
          size={14}
          className={`pointer-events-none absolute left-1.5 top-[15px] text-slate-500 transition ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {saved && (
        <Check
          size={12}
          className="pointer-events-none absolute right-1.5 top-[11px] text-emerald-600 max-md:top-4"
        />
      )}

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            tabIndex={-1}
            aria-label={`اختيار درجة ${criterion.title}`}
            className="fixed z-[100] overflow-y-auto overscroll-contain border border-slate-200 bg-white py-1 shadow-xl outline-none"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              maxHeight: 200,
              borderRadius: 12,
              touchAction: 'pan-y',
              WebkitOverflowScrolling: 'touch',
            }}
            onKeyDown={handleKeyboard}
            onWheel={(event) => event.stopPropagation()}
          >
            <ScoreOption
              index={0}
              value=""
              label="—"
              selected={value === ''}
              active={activeIndex === 0}
              onActivate={setActiveIndex}
              onSelect={selectValue}
            />
            {options.map((option) => (
              <ScoreOption
                key={option}
                index={option + 1}
                value={String(option)}
                label={String(option)}
                selected={value === String(option)}
                active={activeIndex === option + 1}
                onActivate={setActiveIndex}
                onSelect={selectValue}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function ScoreOption({
  index,
  value,
  label,
  selected,
  active,
  onActivate,
  onSelect,
}: {
  index: number;
  value: string;
  label: string;
  selected: boolean;
  active: boolean;
  onActivate: (index: number) => void;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-option-index={index}
      tabIndex={-1}
      className={`flex h-8 w-full items-center justify-center text-sm transition ${
        selected
          ? 'bg-primary font-bold text-white'
          : active
            ? 'bg-secondary/25 font-semibold text-primary'
          : 'text-slate-700 hover:bg-slate-100'
      }`}
      onMouseMove={() => onActivate(index)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(value)}
    >
      {label}
    </button>
  );
}

function normalizeScore(
  value: string | number,
  criterionMaxScore: string | number,
) {
  const numericValue = Number(value);
  const maximum = Math.max(0, Math.floor(Number(criterionMaxScore)));

  if (!Number.isFinite(numericValue) || !Number.isFinite(maximum)) {
    return null;
  }

  return Math.min(maximum, Math.max(0, Math.trunc(numericValue)));
}
