import { useState } from "react";
import { User as UserIcon, Mail, Lock, Trash2, Save } from "lucide-react";
import { Layout } from "../components/Layout";
import { Card, Button, Input } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { authApi } from "../lib/api";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const { user, refreshUser, logout } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function saveProfile() {
    setSavingProfile(true);
    const res = await authApi.updateProfile(name);
    setSavingProfile(false);
    if (res.success) {
      await refreshUser();
      push("Profile updated", "success");
    } else push(res.message, "error");
  }

  async function changePassword() {
    if (newPw.length < 6) {
      push("New password must be at least 6 characters", "warning");
      return;
    }
    setSavingPw(true);
    const res = await authApi.changePassword(currentPw, newPw);
    setSavingPw(false);
    if (res.success) {
      push("Password updated successfully", "success");
      setCurrentPw("");
      setNewPw("");
    } else push(res.message, "error");
  }

  async function deleteAccount() {
    await authApi.deleteAccount();
    push("Account deleted", "info");
    await logout();
    navigate("/login");
  }

  return (
    <Layout title="Profile">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-bold text-white">
              {user?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{user?.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{user?.email}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                <UserIcon className="h-3.5 w-3.5" /> Full Name
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Mail className="h-3.5 w-3.5" /> Email Address
              </label>
              <Input value={user?.email ?? ""} disabled className="opacity-60" />
            </div>
            <Button onClick={saveProfile} disabled={savingProfile} icon={<Save className="h-4 w-4" />}>
              Save Changes
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <Lock className="h-4 w-4" /> Change Password
            </h3>
            <div className="space-y-3">
              <Input type="password" placeholder="Current password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
              <Input type="password" placeholder="New password (6+ characters)" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              <Button onClick={changePassword} disabled={savingPw} variant="secondary">
                Update Password
              </Button>
            </div>
          </Card>

          <Card className="border-rose-200 p-6 dark:border-rose-500/30">
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-rose-600">
              <Trash2 className="h-4 w-4" /> Danger Zone
            </h3>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Permanently delete your account and all associated transcripts, audio, and settings. This cannot be undone.
            </p>
            {!confirmDelete ? (
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete Account
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="danger" onClick={deleteAccount}>
                  Confirm Delete
                </Button>
                <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
