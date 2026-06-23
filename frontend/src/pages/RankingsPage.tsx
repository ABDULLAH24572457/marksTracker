import { Download, Medal, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rankingsApi, reportsApi } from '../api/services';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { StatusMessage } from '../components/StatusMessage';
import type { Ranking } from '../types';
import { getErrorMessage } from '../utils/errors';

export function RankingsPage() {
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRankings(await rankingsApi.list());
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exportPdf = async () => {
    setExporting(true);
    setError('');

    try {
      const pdf = await reportsApi.downloadDetailedResultsPdf();
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'detailed-results.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setExporting(false);
    }
  };

  const stageGroups = useMemo(() => {
    const groups = new Map<string, { name: string; rankings: Ranking[] }>();

    for (const ranking of rankings) {
      const group = groups.get(ranking.stageId) ?? {
        name: ranking.stageName,
        rankings: [],
      };
      group.rankings.push(ranking);
      groups.set(ranking.stageId, group);
    }

    return Array.from(groups.entries())
      .map(([id, group]) => ({
        id,
        title: getStageTitle(group.name),
        rankings: group.rankings.sort(
          (first, second) =>
            first.rank - second.rank ||
            first.familyName.localeCompare(second.familyName),
        ),
      }))
      .sort((first, second) => stageOrder(first.title) - stageOrder(second.title));
  }, [rankings]);

  return (
    <>
      <PageHeader
        title="الترتيب"
        subtitle="ترتيب مستقل لكل مرحلة وفق النتائج الموزونة للدورة الحالية"
        action={
          <div className="flex flex-wrap gap-2">
            {user?.role === 'ADMIN' && (
              <button
                className="btn-primary"
                disabled={exporting}
                onClick={() => void exportPdf()}
              >
                <Download size={17} />
                {exporting
                  ? 'جارٍ التصدير...'
                  : 'تصدير النتائج PDF'}
              </button>
            )}
            <button className="btn-secondary" onClick={() => void load()}>
              <RefreshCw size={17} />
              تحديث
            </button>
          </div>
        }
      />

      {error && <StatusMessage message={error} />}

      {loading ? (
        <div className="py-20 text-center text-slate-500">
          جارٍ تحميل الترتيب...
        </div>
      ) : stageGroups.length === 0 ? (
        <div className="border border-slate-200 bg-white px-4 py-16 text-center text-slate-500">
          لا توجد نتائج
        </div>
      ) : (
        <div className="space-y-8">
          {stageGroups.map((stage) => (
            <section key={stage.id}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-bold text-primary">{stage.title}</h2>
                <span className="text-xs text-slate-500">
                  {stage.rankings.length} أسرة
                </span>
              </div>
              <RankingsTable rankings={stage.rankings} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function RankingsTable({ rankings }: { rankings: Ranking[] }) {
  return (
    <div className="overflow-x-auto border border-slate-200 bg-white shadow-panel">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-primary text-white">
          <tr>
            <th className="w-20 px-4 py-3 text-center">الترتيب</th>
            <th className="px-4 py-3 text-right">الأسرة</th>
            <th className="px-4 py-3 text-right">تفصيل اللجان</th>
            <th className="w-36 px-4 py-3 text-center">المجموع النهائي</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((ranking) => (
            <tr key={ranking.familyId} className="border-t border-slate-100">
              <td className="px-4 py-4 text-center">
                <div className="inline-flex size-9 items-center justify-center gap-1 bg-primary/8 font-bold text-primary">
                  {ranking.rank <= 3 && <Medal size={15} />}
                  {ranking.rank}
                </div>
              </td>
              <td className="px-4 py-4 text-base font-bold text-primary">
                {ranking.familyName}
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  {ranking.committeeBreakdown.length === 0 ? (
                    <span className="text-slate-400">لا توجد درجات</span>
                  ) : (
                    ranking.committeeBreakdown.map((committee) => (
                      <span
                        key={committee.committeeId}
                        className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                      >
                        <strong>{committee.committeeName}</strong>
                        {' · '}
                        {formatScore(committee.weightedScore)}
                      </span>
                    ))
                  )}
                </div>
              </td>
              <td className="px-4 py-4 text-center text-lg font-bold text-primary">
                {formatScore(ranking.totalScore)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getStageTitle(stageName: string) {
  if (stageName.includes('متوسط')) return 'المرحلة المتوسطة';
  if (stageName.includes('ثانوي')) return 'المرحلة الثانوية';
  return stageName;
}

function stageOrder(title: string) {
  if (title === 'المرحلة المتوسطة') return 1;
  if (title === 'المرحلة الثانوية') return 2;
  return 3;
}

function formatScore(value: number) {
  return Number(value.toFixed(2)).toString();
}
