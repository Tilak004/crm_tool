import ActionForm from "@/components/ActionForm";

type State = { ok: boolean; message: string } | null;

/** CA form for a new remark; `action` is addRemark bound to the merchant (and day). */
export default function RemarkForm({ action, placeholder }: { action: (prev: State, form: FormData) => Promise<State>; placeholder: string }) {
  return (
    <ActionForm action={action} submitLabel="Send remark" className="mt-3 space-y-2">
      <textarea name="text" required maxLength={2000} rows={3} className="input" placeholder={placeholder} />
      <p className="text-xs text-gray-500">The merchant will see this. Remarks can&apos;t be edited or deleted afterwards and are kept in the edit log.</p>
    </ActionForm>
  );
}
