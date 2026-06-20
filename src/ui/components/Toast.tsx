import { useToast } from "../toast";

export function Toast() {
  const message = useToast((s) => s.message);
  const open = useToast((s) => s.open);
  return (
    <div className={"toast" + (open ? " open" : "")} role="status" aria-live="polite">
      {message}
    </div>
  );
}
