'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, UserCheck, UserX } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth-context';
import api from '@/lib/api';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  phone: string | null;
  twilioCallerId: string | null;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'MANAGER' | 'AGENT';
  phone: string;
  twilioCallerId: string;
}

const emptyForm: UserFormData = {
  name: '', email: '', password: '', role: 'AGENT', phone: '', twilioCallerId: '',
};

export default function UsersPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['auth-users'],
    queryFn: () => api.get('/api/auth/users').then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: (d: UserFormData) => api.post('/api/auth/users', d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['auth-users'] }); setDialogOpen(false); setForm(emptyForm); setError(''); },
    onError: (e: { response?: { data?: { error?: string } } }) => setError(e.response?.data?.error || 'Failed'),
  });

  const updateMut = useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: Record<string, unknown> }) =>
      api.patch(`/api/auth/users/${userId}`, updates),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['auth-users'] }); setDialogOpen(false); setEditingUser(null); setForm(emptyForm); setError(''); },
    onError: (e: { response?: { data?: { error?: string } } }) => setError(e.response?.data?.error || 'Failed'),
  });

  const users: UserRow[] = data?.users ?? [];

  if (!isAdmin) {
    router.push('/');
    return null;
  }

  function openCreate() { setEditingUser(null); setForm(emptyForm); setError(''); setDialogOpen(true); }

  function openEdit(u: UserRow) {
    setEditingUser(u);
    setForm({ name: u.name ?? '', email: u.email, password: '', role: u.role as UserFormData['role'], phone: u.phone ?? '', twilioCallerId: u.twilioCallerId ?? '' });
    setError(''); setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingUser) {
      const upd: Record<string, unknown> = { name: form.name, role: form.role, phone: form.phone || null, twilioCallerId: form.twilioCallerId || null };
      if (form.password) upd.password = form.password;
      updateMut.mutate({ userId: editingUser.id, updates: upd });
    } else {
      createMut.mutate(form);
    }
  }

  function toggleActive(u: UserRow) { updateMut.mutate({ userId: u.id, updates: { active: !u.active } }); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">User Management</h2>
        <Button onClick={openCreate} size="sm"><Plus className="mr-1 h-4 w-4" /> Add User</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Twilio #</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Login</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-3 font-medium">{u.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3"><Badge variant={u.role === 'ADMIN' ? 'default' : 'outline'} className="text-xs">{u.role}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{u.twilioCallerId ?? '—'}</td>
                    <td className="px-4 py-3"><Badge variant={u.active ? 'default' : 'secondary'} className="text-xs">{u.active ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(u)}>
                          {u.active ? <UserX className="h-3.5 w-3.5 text-destructive" /> : <UserCheck className="h-3.5 w-3.5 text-emerald-500" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingUser ? 'Edit User' : 'Add User'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" required disabled={!!editingUser} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Password{editingUser ? ' (leave blank to keep)' : ''}</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" required={!editingUser} minLength={8} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserFormData['role'] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="AGENT">Agent</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone (personal)</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Twilio Caller ID</label>
              <input type="tel" value={form.twilioCallerId} onChange={e => setForm(f => ({ ...f, twilioCallerId: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" placeholder="+15091234567" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>{editingUser ? 'Save' : 'Create User'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
