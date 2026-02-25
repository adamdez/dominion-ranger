'use client';

import { useState, useEffect } from 'react';
import { User, Lock, BarChart3, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useProfile, useUpdateProfile, useChangePassword } from '@/hooks/use-profile';

function getInitials(name: string | null, firstName?: string | null, lastName?: string | null): string {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName ?? profile.name?.split(' ')[0] ?? '');
      setLastName(profile.lastName ?? profile.name?.split(' ').slice(1).join(' ') ?? '');
      setPhone(profile.phone ?? '');
    }
  }, [profile]);

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateProfile.mutate({ firstName, lastName, phone: phone || null });
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        },
      },
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" /> Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
                {getInitials(profile?.name ?? null, profile?.firstName, profile?.lastName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{profile?.name}</p>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
              <Badge variant="outline" className="mt-1 text-xs">{profile?.role}</Badge>
            </div>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={profile?.email ?? ''} disabled className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15551234567" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input value={profile?.role ?? ''} disabled className="bg-muted" />
            </div>
            <Button type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Current Password</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm New Password</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
            </div>
            {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
            <Button type="submit" variant="outline" disabled={changePassword.isPending}>
              {changePassword.isPending ? 'Changing...' : 'Change Password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Stats Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" /> Stats Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">{profile?.stats?.totalLeads ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Leads</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">{profile?.stats?.totalDials ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Dials</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">{profile?.stats?.totalOffers ?? 0}</p>
              <p className="text-xs text-muted-foreground">Offers Sent</p>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              Account created {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
