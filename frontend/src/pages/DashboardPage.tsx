import {
  ClipboardCheck,
  House,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  UserCog,
  UsersRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  committeesApi,
  criteriaApi,
  familiesApi,
  scoresApi,
  usersApi,
  type CommitteeInput,
  type CriterionInput,
  type UserInput,
} from "../api/services";
import { PageHeader } from "../components/PageHeader";
import { StatusMessage } from "../components/StatusMessage";
import type {
  Committee,
  Criterion,
  Family,
  Stage,
  User,
  UserRole,
} from "../types";
import { getErrorMessage } from "../utils/errors";

type DashboardTab = "users" | "committees" | "families" | "criteria";

const tabs = [
  { id: "users" as const, label: "المستخدمون", icon: UserCog },
  { id: "committees" as const, label: "اللجان", icon: UsersRound },
  { id: "families" as const, label: "الأسر", icon: House },
  { id: "criteria" as const, label: "المعايير", icon: ClipboardCheck },
];

const DASHBOARD_TAB_KEY = "marks_tracker_dashboard_tab";

function isDashboardTab(value: string | null): value is DashboardTab {
  return tabs.some((tab) => tab.id === value);
}

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => {
    const queryTab = searchParams.get("tab");
    const savedTab = localStorage.getItem(DASHBOARD_TAB_KEY);

    if (isDashboardTab(queryTab)) return queryTab;
    if (isDashboardTab(savedTab)) return savedTab;
    return "users";
  });
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loadingCommittees, setLoadingCommittees] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  const loadCommittees = useCallback(async () => {
    setLoadingCommittees(true);
    try {
      setCommittees(await committeesApi.list());
    } finally {
      setLoadingCommittees(false);
    }
  }, []);

  useEffect(() => {
    void loadCommittees();
  }, [loadCommittees]);

  useEffect(() => {
    const queryTab = searchParams.get("tab");

    if (isDashboardTab(queryTab)) {
      setActiveTab(queryTab);
      localStorage.setItem(DASHBOARD_TAB_KEY, queryTab);
      return;
    }

    setSearchParams({ tab: activeTab }, { replace: true });
  }, [activeTab, searchParams, setSearchParams]);

  const selectTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    localStorage.setItem(DASHBOARD_TAB_KEY, tab);
    setSearchParams({ tab }, { replace: true });
  };

  const resetScores = async () => {
    setResetBusy(true);
    setResetError("");
    setResetSuccess("");

    try {
      const result = await scoresApi.reset();
      setResetSuccess(result.message);
      setResetOpen(false);
      window.dispatchEvent(new Event("scores:reset"));
    } catch (requestError) {
      setResetError(getErrorMessage(requestError));
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="لوحة التحكم"
        subtitle="إدارة المستخدمين واللجان ومعايير التقييم"
      />

      {resetSuccess && <StatusMessage message={resetSuccess} tone="success" />}
      {resetError && <StatusMessage message={resetError} />}

      <section
        className="mb-6 flex flex-wrap items-center justify-between gap-4 border border-red-200 bg-white p-4"
        style={{ borderRadius: 8 }}
      >
        <div>
          <h2 className="font-bold text-primary">أدوات الإدارة</h2>
          <p className="mt-1 text-sm text-slate-500">
            تصفير درجات المنافسة الحالية دون حذف بيانات النظام.
          </p>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800"
          style={{ borderRadius: 6 }}
          onClick={() => {
            setResetError("");
            setResetOpen(true);
          }}
        >
          <RotateCcw size={17} />
          تصفير الدرجات
        </button>
      </section>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => selectTab(id)}
            className={`flex min-w-max items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === id
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-primary"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "users" && (
        <UsersSection
          committees={committees}
          committeesLoading={loadingCommittees}
        />
      )}
      {activeTab === "committees" && (
        <CommitteesSection committees={committees} onRefresh={loadCommittees} />
      )}
      {activeTab === "families" && <FamiliesSection />}
      {activeTab === "criteria" && <CriteriaSection committees={committees} />}

      {resetOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-scores-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !resetBusy) {
              setResetOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-lg border border-slate-200 bg-white p-6 shadow-panel"
            style={{ borderRadius: 8 }}
          >
            <h2
              id="reset-scores-title"
              className="text-xl font-bold text-primary"
            >
              تأكيد تصفير الدرجات
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              سيتم حذف جميع الدرجات الحالية ولا يمكن التراجع عن هذا الإجراء. هل
              أنت متأكد؟
            </p>

            {resetError && (
              <div className="mt-4">
                <StatusMessage message={resetError} />
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                className="btn-secondary"
                disabled={resetBusy}
                onClick={() => setResetOpen(false)}
              >
                إلغاء
              </button>
              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderRadius: 6 }}
                disabled={resetBusy}
                onClick={() => void resetScores()}
              >
                <RotateCcw size={17} />
                {resetBusy ? "جارٍ التصفير..." : "نعم، صفر الدرجات"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SectionShell({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-bold text-primary">{title}</h2>
        <span className="bg-primary/8 px-2.5 py-1 text-xs font-bold text-primary">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function EditModal({
  title,
  busy,
  error,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/45 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl border border-slate-200 bg-white p-6 shadow-panel"
        style={{ borderRadius: 8 }}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="edit-dialog-title" className="text-xl font-bold text-primary">
            {title}
          </h2>
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            title="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        {error && <StatusMessage message={error} />}
        <div className="grid gap-4 md:grid-cols-2">{children}</div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            إلغاء
          </button>
          <button className="btn-primary" disabled={busy}>
            <Save size={17} />
            {busy ? "جارٍ الحفظ..." : "حفظ التعديل"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormActions({ busy }: { busy: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <button className="btn-primary" disabled={busy}>
        <Plus size={17} />
        إضافة
      </button>
    </div>
  );
}

function UsersSection({
  committees,
  committeesLoading,
}: {
  committees: Committee[];
  committeesLoading: boolean;
}) {
  const emptyForm: UserInput = {
    name: "",
    email: "",
    password: "",
    role: "DATA_ENTRY",
    committeeId: "",
  };
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<UserInput>(emptyForm);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<UserInput>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUsers(await usersApi.list());
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      ...form,
      committeeId: form.role === "ADMIN" ? null : form.committeeId,
    };

    try {
      await usersApi.create({
        ...payload,
        password: form.password ?? "",
      });
      setForm(emptyForm);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const edit = (user: User) => {
    setEditingUser(user);
    setEditError("");
    setEditForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      committeeId: user.committeeId,
    });
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingUser) return;

    setEditBusy(true);
    setEditError("");
    const payload: Partial<UserInput> = {
      ...editForm,
      committeeId:
        editForm.role === "ADMIN" ? null : editForm.committeeId,
    };
    if (!payload.password) delete payload.password;

    try {
      await usersApi.update(editingUser.id, payload);
      setEditingUser(null);
      await load();
    } catch (requestError) {
      setEditError(getErrorMessage(requestError));
    } finally {
      setEditBusy(false);
    }
  };

  const remove = async (user: User) => {
    if (!window.confirm(`حذف المستخدم ${user.name}؟`)) return;
    try {
      await usersApi.remove(user.id);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  return (
    <SectionShell title="إدارة المستخدمين" count={users.length}>
      {error && <StatusMessage message={error} />}
      <form
        onSubmit={submit}
        className="mb-6 grid gap-4 border border-slate-200 bg-white p-4 shadow-panel md:grid-cols-2 xl:grid-cols-5"
        style={{ borderRadius: 8 }}
      >
        <input
          className="field"
          placeholder="الاسم"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          required
        />
        <input
          className="field"
          type="email"
          dir="ltr"
          placeholder="البريد الإلكتروني"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          required
        />
        <input
          className="field"
          type="password"
          dir="ltr"
          placeholder="كلمة المرور"
          minLength={8}
          value={form.password ?? ""}
          onChange={(event) =>
            setForm({ ...form, password: event.target.value })
          }
          required
        />
        <select
          className="field"
          value={form.role}
          onChange={(event) => {
            const role = event.target.value as UserRole;
            setForm({
              ...form,
              role,
              committeeId: role === "ADMIN" ? null : form.committeeId || "",
            });
          }}
        >
          <option value="DATA_ENTRY">مدخل درجات</option>
          <option value="ADMIN">مدير</option>
        </select>
        <select
          className="field"
          value={form.committeeId ?? ""}
          disabled={form.role === "ADMIN" || committeesLoading}
          required={form.role === "DATA_ENTRY"}
          onChange={(event) =>
            setForm({ ...form, committeeId: event.target.value })
          }
        >
          <option value="">اختر اللجنة</option>
          {committees.map((committee) => (
            <option key={committee.id} value={committee.id}>
              {committee.name}
            </option>
          ))}
        </select>
        <div className="md:col-span-2 xl:col-span-5">
          <FormActions busy={busy} />
        </div>
      </form>

      <div className="overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-primary text-white">
            <tr>
              <th className="px-4 py-3 text-right">الاسم</th>
              <th className="px-4 py-3 text-right">البريد</th>
              <th className="px-4 py-3 text-right">الصلاحية</th>
              <th className="px-4 py-3 text-right">اللجنة</th>
              <th className="w-24 px-4 py-3">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableMessage colSpan={5} text="جارٍ التحميل..." />
            ) : users.length === 0 ? (
              <TableMessage colSpan={5} text="لا يوجد مستخدمون" />
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{user.name}</td>
                  <td className="px-4 py-3" dir="ltr">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    {user.role === "ADMIN" ? "مدير" : "مدخل درجات"}
                  </td>
                  <td className="px-4 py-3">{user.committee?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <button
                        className="icon-button"
                        onClick={() => edit(user)}
                        title="تعديل"
                      >
                        <Pencil size={16} />
                      </button>
                      {!isProtectedAdmin(user) && (
                        <button
                          className="icon-button text-red-600"
                          onClick={() => void remove(user)}
                          title="حذف"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <EditModal
          title="تعديل المستخدم"
          busy={editBusy}
          error={editError}
          onClose={() => setEditingUser(null)}
          onSubmit={submitEdit}
        >
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">الاسم</span>
            <input
              className="field"
              value={editForm.name}
              onChange={(event) =>
                setEditForm({ ...editForm, name: event.target.value })
              }
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">
              البريد الإلكتروني
            </span>
            <input
              className="field"
              type="email"
              dir="ltr"
              value={editForm.email}
              onChange={(event) =>
                setEditForm({ ...editForm, email: event.target.value })
              }
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">
              كلمة مرور جديدة (اختياري)
            </span>
            <input
              className="field"
              type="password"
              dir="ltr"
              minLength={8}
              value={editForm.password ?? ""}
              onChange={(event) =>
                setEditForm({ ...editForm, password: event.target.value })
              }
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">الصلاحية</span>
            <select
              className="field"
              value={editForm.role}
              onChange={(event) => {
                const role = event.target.value as UserRole;
                setEditForm({
                  ...editForm,
                  role,
                  committeeId:
                    role === "ADMIN" ? null : editForm.committeeId || "",
                });
              }}
            >
              <option value="DATA_ENTRY">مدخل درجات</option>
              <option value="ADMIN">مدير</option>
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-semibold">اللجنة</span>
            <select
              className="field"
              value={editForm.committeeId ?? ""}
              disabled={editForm.role === "ADMIN" || committeesLoading}
              required={editForm.role === "DATA_ENTRY"}
              onChange={(event) =>
                setEditForm({
                  ...editForm,
                  committeeId: event.target.value,
                })
              }
            >
              <option value="">اختر اللجنة</option>
              {committees.map((committee) => (
                <option key={committee.id} value={committee.id}>
                  {committee.name}
                </option>
              ))}
            </select>
          </label>
        </EditModal>
      )}
    </SectionShell>
  );
}

function CommitteesSection({
  committees,
  onRefresh,
}: {
  committees: Committee[];
  onRefresh: () => Promise<void>;
}) {
  const emptyForm: CommitteeInput = {
    name: "",
    weightPercentage: 0,
  };
  const [form, setForm] = useState<CommitteeInput>(emptyForm);
  const [editingCommittee, setEditingCommittee] =
    useState<Committee | null>(null);
  const [editForm, setEditForm] = useState<CommitteeInput>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await committeesApi.create(form);
      setForm(emptyForm);
      await onRefresh();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (committee: Committee) => {
    setEditingCommittee(committee);
    setEditError("");
    setEditForm({
      name: committee.name,
      weightPercentage: Number(committee.weightPercentage),
    });
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCommittee) return;

    setEditBusy(true);
    setEditError("");
    try {
      await committeesApi.update(editingCommittee.id, editForm);
      setEditingCommittee(null);
      await onRefresh();
    } catch (requestError) {
      setEditError(getErrorMessage(requestError));
    } finally {
      setEditBusy(false);
    }
  };

  const remove = async (committee: Committee) => {
    if (!window.confirm(`حذف لجنة ${committee.name}؟`)) return;
    try {
      await committeesApi.remove(committee.id);
      await onRefresh();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  return (
    <SectionShell title="إدارة اللجان" count={committees.length}>
      {error && <StatusMessage message={error} />}
      <form
        onSubmit={submit}
        className="mb-6 grid gap-4 border border-slate-200 bg-white p-4 shadow-panel md:grid-cols-[minmax(200px,1fr)_180px_auto]"
        style={{ borderRadius: 8 }}
      >
        <input
          className="field"
          placeholder="اسم اللجنة"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          required
        />
        <input
          className="field"
          type="number"
          min="0"
          max="100"
          step="0.01"
          placeholder="الوزن %"
          value={form.weightPercentage}
          onChange={(event) =>
            setForm({ ...form, weightPercentage: Number(event.target.value) })
          }
          required
        />
        <FormActions busy={busy} />
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {committees.map((committee) => (
          <article
            key={committee.id}
            className="border border-slate-200 bg-white p-4"
            style={{ borderRadius: 8 }}
          >
            <div>
              <div>
                <h3 className="font-bold text-primary">{committee.name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  الوزن: {Number(committee.weightPercentage).toFixed(2)}%
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
              <button
                className="icon-button"
                title="تعديل"
                onClick={() => openEdit(committee)}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-button text-red-600"
                title="حذف"
                onClick={() => void remove(committee)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {editingCommittee && (
        <EditModal
          title="تعديل اللجنة"
          busy={editBusy}
          error={editError}
          onClose={() => setEditingCommittee(null)}
          onSubmit={submitEdit}
        >
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">اسم اللجنة</span>
            <input
              className="field"
              value={editForm.name}
              onChange={(event) =>
                setEditForm({ ...editForm, name: event.target.value })
              }
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">الوزن %</span>
            <input
              className="field"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={editForm.weightPercentage}
              onChange={(event) =>
                setEditForm({
                  ...editForm,
                  weightPercentage: Number(event.target.value),
                })
              }
              required
            />
          </label>
        </EditModal>
      )}
    </SectionShell>
  );
}

function FamiliesSection() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [form, setForm] = useState({ name: "", stageId: "" });
  const [editingFamily, setEditingFamily] = useState<Family | null>(null);
  const [editForm, setEditForm] = useState({ name: "", stageId: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");

  const stages = useMemo(
    () =>
      Array.from(
        new Map(
          families.map((family) => [family.stage.id, family.stage]),
        ).values(),
      ) as Stage[],
    [families],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await familiesApi.list();
      setFamilies(data);
      setForm((current) => ({
        ...current,
        stageId: current.stageId || data[0]?.stageId || "",
      }));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await familiesApi.create(form);
      setForm({
        name: "",
        stageId: stages[0]?.id ?? "",
      });
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (family: Family) => {
    setEditingFamily(family);
    setEditError("");
    setEditForm({
      name: family.name,
      stageId: family.stageId,
    });
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingFamily) return;

    setEditBusy(true);
    setEditError("");
    try {
      await familiesApi.update(editingFamily.id, editForm);
      setEditingFamily(null);
      await load();
    } catch (requestError) {
      setEditError(getErrorMessage(requestError));
    } finally {
      setEditBusy(false);
    }
  };

  const remove = async (family: Family) => {
    if (!window.confirm(`حذف الأسرة ${family.name}؟`)) return;

    try {
      await familiesApi.remove(family.id);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  return (
    <SectionShell title="إدارة الأسر" count={families.length}>
      {error && <StatusMessage message={error} />}

      <form
        onSubmit={submit}
        className="mb-6 grid gap-4 border border-slate-200 bg-white p-4 shadow-panel md:grid-cols-[minmax(220px,1fr)_220px_auto]"
        style={{ borderRadius: 8 }}
      >
        <input
          className="field"
          placeholder="اسم الأسرة"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          required
        />
        <select
          className="field"
          value={form.stageId}
          onChange={(event) =>
            setForm({ ...form, stageId: event.target.value })
          }
          required
        >
          <option value="">اختر المرحلة</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
        <FormActions busy={busy} />
      </form>

      <div className="overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-primary text-white">
            <tr>
              <th className="px-4 py-3 text-right">اسم الأسرة</th>
              <th className="px-4 py-3 text-right">المرحلة</th>
              <th className="w-24 px-4 py-3">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableMessage colSpan={3} text="جارٍ التحميل..." />
            ) : families.length === 0 ? (
              <TableMessage colSpan={3} text="لا توجد أسر" />
            ) : (
              families.map((family) => (
                <tr key={family.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{family.name}</td>
                  <td className="px-4 py-3">{family.stage.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <button
                        className="icon-button"
                        title="تعديل"
                        onClick={() => openEdit(family)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button text-red-600"
                        title="حذف"
                        onClick={() => void remove(family)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingFamily && (
        <EditModal
          title="تعديل الأسرة"
          busy={editBusy}
          error={editError}
          onClose={() => setEditingFamily(null)}
          onSubmit={submitEdit}
        >
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">اسم الأسرة</span>
            <input
              className="field"
              value={editForm.name}
              onChange={(event) =>
                setEditForm({ ...editForm, name: event.target.value })
              }
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">المرحلة</span>
            <select
              className="field"
              value={editForm.stageId}
              onChange={(event) =>
                setEditForm({ ...editForm, stageId: event.target.value })
              }
              required
            >
              <option value="">اختر المرحلة</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
        </EditModal>
      )}
    </SectionShell>
  );
}

function CriteriaSection({ committees }: { committees: Committee[] }) {
  const emptyForm: CriterionInput = {
    title: "",
    description: "",
    maxScore: 1,
    committeeId: "",
    displayOrder: 0,
  };
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [form, setForm] = useState<CriterionInput>(emptyForm);
  const [editingCriterion, setEditingCriterion] =
    useState<Criterion | null>(null);
  const [editForm, setEditForm] = useState<CriterionInput>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");

  const grouped = useMemo(
    () =>
      committees.map((committee) => ({
        committee,
        criteria: criteria.filter(
          (criterion) => criterion.committeeId === committee.id,
        ),
      })),
    [committees, criteria],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCriteria(await criteriaApi.list());
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await criteriaApi.create(form);
      setForm(emptyForm);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (criterion: Criterion) => {
    setEditingCriterion(criterion);
    setEditError("");
    setEditForm({
      title: criterion.title,
      description: criterion.description ?? "",
      maxScore: Number(criterion.maxScore),
      committeeId: criterion.committeeId,
      displayOrder: criterion.displayOrder,
    });
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCriterion) return;

    setEditBusy(true);
    setEditError("");
    try {
      await criteriaApi.update(editingCriterion.id, editForm);
      setEditingCriterion(null);
      await load();
    } catch (requestError) {
      setEditError(getErrorMessage(requestError));
    } finally {
      setEditBusy(false);
    }
  };

  const remove = async (criterion: Criterion) => {
    if (!window.confirm(`حذف معيار ${criterion.title}؟`)) return;
    try {
      await criteriaApi.remove(criterion.id);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  return (
    <SectionShell title="إدارة المعايير" count={criteria.length}>
      {error && <StatusMessage message={error} />}
      <form
        onSubmit={submit}
        className="mb-6 grid gap-4 border border-slate-200 bg-white p-4 shadow-panel md:grid-cols-2 xl:grid-cols-5"
        style={{ borderRadius: 8 }}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-800">
            اسم المعيار
          </span>
          <input
            className="field"
            value={form.title}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-800">
            اللجنة
          </span>
          <select
            className="field"
            value={form.committeeId}
            onChange={(event) =>
              setForm({ ...form, committeeId: event.target.value })
            }
            required
          >
            <option value="">اختر اللجنة</option>
            {committees.map((committee) => (
              <option key={committee.id} value={committee.id}>
                {committee.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-800">
            الدرجة القصوى
          </span>
          <input
            className="field"
            type="number"
            min="0.01"
            step="0.01"
            value={form.maxScore}
            onChange={(event) =>
              setForm({ ...form, maxScore: Number(event.target.value) })
            }
            required
          />
          <span className="mt-1.5 block text-xs leading-5 text-slate-500">
            أعلى درجة يمكن منحها لهذا المعيار
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-800">
            ترتيب العرض
          </span>
          <input
            className="field"
            type="number"
            min="0"
            value={form.displayOrder ?? 0}
            onChange={(event) =>
              setForm({ ...form, displayOrder: Number(event.target.value) })
            }
          />
          <span className="mt-1.5 block text-xs leading-5 text-slate-500">
            يحدد ترتيب ظهور المعيار داخل اللجنة
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-800">
            الوصف (اختياري)
          </span>
          <input
            className="field"
            value={form.description ?? ""}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
        </label>
        <div className="md:col-span-2 xl:col-span-5">
          <FormActions busy={busy} />
        </div>
      </form>

      {loading ? (
        <div className="py-12 text-center text-slate-500">جارٍ التحميل...</div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ committee, criteria: committeeCriteria }) => (
            <section
              key={committee.id}
              className="border border-slate-200 bg-white"
            >
              <div className="flex items-center justify-between bg-primary px-4 py-3 text-white">
                <h3 className="font-bold">{committee.name}</h3>
                <span className="text-xs text-white/70">
                  {committeeCriteria.length} معيار
                </span>
              </div>
              {committeeCriteria.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500">
                  لا توجد معايير
                </div>
              ) : (
                committeeCriteria.map((criterion) => (
                  <div
                    key={criterion.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3"
                  >
                    <div>
                      <div className="font-semibold">{criterion.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        الدرجة القصوى: {Number(criterion.maxScore).toFixed(2)}
                        {criterion.description
                          ? ` · ${criterion.description}`
                          : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="icon-button"
                        title="تعديل"
                        onClick={() => openEdit(criterion)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button text-red-600"
                        title="حذف"
                        onClick={() => void remove(criterion)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>
          ))}
        </div>
      )}

      {editingCriterion && (
        <EditModal
          title="تعديل المعيار"
          busy={editBusy}
          error={editError}
          onClose={() => setEditingCriterion(null)}
          onSubmit={submitEdit}
        >
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">
              اسم المعيار
            </span>
            <input
              className="field"
              value={editForm.title}
              onChange={(event) =>
                setEditForm({ ...editForm, title: event.target.value })
              }
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">اللجنة</span>
            <select
              className="field"
              value={editForm.committeeId}
              onChange={(event) =>
                setEditForm({
                  ...editForm,
                  committeeId: event.target.value,
                })
              }
              required
            >
              <option value="">اختر اللجنة</option>
              {committees.map((committee) => (
                <option key={committee.id} value={committee.id}>
                  {committee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">
              الدرجة القصوى
            </span>
            <input
              className="field"
              type="number"
              min="0.01"
              step="0.01"
              value={editForm.maxScore}
              onChange={(event) =>
                setEditForm({
                  ...editForm,
                  maxScore: Number(event.target.value),
                })
              }
              required
            />
            <span className="mt-1.5 block text-xs leading-5 text-slate-500">
              أعلى درجة يمكن منحها لهذا المعيار
            </span>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">
              ترتيب العرض
            </span>
            <input
              className="field"
              type="number"
              min="0"
              value={editForm.displayOrder ?? 0}
              onChange={(event) =>
                setEditForm({
                  ...editForm,
                  displayOrder: Number(event.target.value),
                })
              }
            />
            <span className="mt-1.5 block text-xs leading-5 text-slate-500">
              يحدد ترتيب ظهور المعيار داخل اللجنة
            </span>
          </label>
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-semibold">
              الوصف (اختياري)
            </span>
            <textarea
              className="field min-h-28 resize-y"
              value={editForm.description ?? ""}
              onChange={(event) =>
                setEditForm({
                  ...editForm,
                  description: event.target.value,
                })
              }
            />
          </label>
        </EditModal>
      )}
    </SectionShell>
  );
}

function TableMessage({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-slate-500">
        {text}
      </td>
    </tr>
  );
}

function isProtectedAdmin(user: User) {
  return (
    user.role === "ADMIN" &&
    ["ab443442@gmail.com", "admin@example.com"].includes(
      user.email.toLowerCase(),
    )
  );
}
