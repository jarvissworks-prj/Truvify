import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "./Common";
import { Spinner, Trash } from "./Icons";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { backend } from "../lib/api";

export function DeleteAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signOut } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await backend.deleteAccount();
      await signOut();
      onClose();
      nav("/", { replace: true });
    } catch (e) {
      toast((e as Error).message, "error");
      setDeleting(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !deleting && onClose()}>
      <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4">
        <Trash size={20} />
      </div>
      <h3 className="text-[18px] font-semibold text-primary">Delete your account?</h3>
      <p className="text-[13px] text-neutral-600 mt-2 leading-relaxed">
        Are you sure? This will permanently delete your account and all your documents. This cannot be undone.
      </p>
      <div className="flex justify-end gap-2 mt-6">
        <button onClick={onClose} disabled={deleting} className="btn-outline h-10 px-5 text-[13px]">
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="h-10 px-5 rounded-full bg-red-600 hover:bg-red-700 text-white text-[13px] font-medium inline-flex items-center gap-2 disabled:opacity-60"
        >
          {deleting && <Spinner size={13} />} Delete permanently
        </button>
      </div>
    </Modal>
  );
}
