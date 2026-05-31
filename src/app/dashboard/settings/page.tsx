'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { User, Mail, Phone, Lock, Bell, Shield, Camera, Save } from 'lucide-react';
import { useState } from 'react';

export default function SettingsPage() {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <Card className="emmy-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5 text-emmy-primary" />
              Profile Information
            </CardTitle>
            <CardDescription>Update your personal details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-20 h-20 rounded-full bg-emmy-primary/10 flex items-center justify-center relative">
                <span className="text-3xl font-bold text-emmy-primary">S</span>
                <button className="absolute bottom-0 right-0 w-6 h-6 bg-emmy-secondary rounded-full flex items-center justify-center text-white">
                  <Camera className="w-3 h-3" />
                </button>
              </div>
              <div>
                <p className="font-semibold text-slate-900">SkyQ</p>
                <p className="text-sm text-slate-500">Ambassador since May 2026</p>
                <Badge variant="secondary" className="mt-1">Active</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input defaultValue="SkyQ" className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input defaultValue="skyq@example.com" className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Phone</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input defaultValue="+23480xxxxxx" className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">WhatsApp Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input defaultValue="+2348146503700" className="pl-9" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Card */}
        <Card className="emmy-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-emmy-primary" />
              Security
            </CardTitle>
            <CardDescription>Manage your password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Current Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input type="password" placeholder="••••••••" className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input type="password" placeholder="Min 6 characters" className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input type="password" placeholder="Min 6 characters" className="pl-9" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notifications */}
      <Card className="emmy-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="w-5 h-5 text-emmy-primary" />
            Notifications
          </CardTitle>
          <CardDescription>Choose what you want to be notified about</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { label: 'Post Approvals', desc: 'When your posts are approved or rejected', checked: true },
              { label: 'New Leads', desc: 'When someone clicks your WhatsApp link', checked: true },
              { label: 'Conversions', desc: 'When a lead converts to a sale', checked: true },
              { label: 'Leaderboard Updates', desc: 'Weekly leaderboard position changes', checked: false },
              { label: 'Point Rewards', desc: 'When you earn points', checked: true },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">{item.label}</p>
                  <p className="text-sm text-slate-500">{item.desc}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked={item.checked} className="sr-only peer" />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emmy-primary"></div>
                </label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={saving}
          size="lg"
          className="bg-emmy-primary hover:bg-emmy-primary-light"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}