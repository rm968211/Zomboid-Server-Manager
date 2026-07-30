import { Head, router } from '@inertiajs/react';
import { Clock, Plus, Timer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import AppLayout from '@/layouts/app-layout';
import { fetchAction } from '@/lib/fetch-action';
import type { BreadcrumbItem } from '@/types';

type ScheduleEntry = {
    id: number;
    time: string;
    enabled: boolean;
};

type Settings = {
    enabled: boolean;
    warning_minutes: number;
    warning_message: string | null;
    timezone: string;
    discord_reminder_minutes: number;
};

type Props = {
    settings: Settings;
    schedule: ScheduleEntry[];
    next_restart_at: string | null;
};

const WARNING_OPTIONS = [
    { value: '2', label: '2 minutes' },
    { value: '5', label: '5 minutes' },
    { value: '10', label: '10 minutes' },
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
] as const;

const DISCORD_REMINDER_OPTIONS = [
    { value: '5', label: '5 minutes' },
    { value: '10', label: '10 minutes' },
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
    { value: '60', label: '60 minutes' },
] as const;

const TIMEZONE_OPTIONS = [
    'Asia/Tbilisi',
    'Europe/Moscow',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Paris',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'Asia/Tokyo',
    'Australia/Sydney',
    'UTC',
] as const;

export default function AutoRestart({
    settings,
    schedule,
    next_restart_at,
}: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Auto Restart', href: '/admin/auto-restart' },
    ];
    const [enabled, setEnabled] = useState(settings.enabled);
    const [warningMinutes, setWarningMinutes] = useState(
        String(settings.warning_minutes),
    );
    const [warningMessage, setWarningMessage] = useState(
        settings.warning_message ?? '',
    );
    const [timezone, setTimezone] = useState(settings.timezone);
    const [discordReminderMinutes, setDiscordReminderMinutes] = useState(
        String(settings.discord_reminder_minutes),
    );
    const [saving, setSaving] = useState(false);
    const [newTime, setNewTime] = useState('');
    const [addingTime, setAddingTime] = useState(false);

    async function save() {
        setSaving(true);
        await fetchAction('/admin/auto-restart', {
            method: 'PATCH',
            data: {
                enabled,
                warning_minutes: parseInt(warningMinutes, 10),
                warning_message: warningMessage.trim() || null,
                timezone,
                discord_reminder_minutes: parseInt(discordReminderMinutes, 10),
            },
            successMessage: 'Auto-restart settings saved',
        });
        setSaving(false);
        router.reload();
    }

    async function addTime() {
        if (!newTime) return;
        setAddingTime(true);
        const result = await fetchAction('/admin/auto-restart/times', {
            method: 'POST',
            data: { time: newTime },
            successMessage: 'Restart time added',
        });
        setAddingTime(false);
        if (result) {
            setNewTime('');
            router.reload();
        }
    }

    async function deleteTime(id: number) {
        await fetchAction(`/admin/auto-restart/times/${id}`, {
            method: 'DELETE',
            successMessage: 'Restart time removed',
        });
        router.reload();
    }

    async function toggleTime(id: number) {
        await fetchAction(`/admin/auto-restart/times/${id}/toggle`, {
            method: 'POST',
            successMessage: 'Restart time toggled',
        });
        router.reload();
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Auto Restart" />
            <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Auto Restart
                    </h1>
                    <p className="text-muted-foreground">
                        {
                            'Schedule daily restart times so the community can plan around predictable restart windows.'
                        }
                    </p>
                </div>

                {/* Settings Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Timer className="size-5" />
                            Restart Settings
                        </CardTitle>
                        <CardDescription>
                            {
                                'Configure automatic server restarts with in-game countdown warnings and Discord reminders.'
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Enable/Disable */}
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="auto-restart-enabled">
                                    Enable Auto Restart
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    {
                                        'When enabled, the server will restart at the scheduled daily times.'
                                    }
                                </p>
                            </div>
                            <Switch
                                id="auto-restart-enabled"
                                checked={enabled}
                                onCheckedChange={setEnabled}
                            />
                        </div>

                        <Separator />

                        {/* Timezone */}
                        <div className="grid gap-2">
                            <Label htmlFor="timezone">{'Timezone'}</Label>
                            <p className="text-sm text-muted-foreground">
                                {
                                    'Scheduled times are interpreted in this timezone.'
                                }
                            </p>
                            <Select
                                value={timezone}
                                onValueChange={setTimezone}
                            >
                                <SelectTrigger id="timezone">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TIMEZONE_OPTIONS.map((tz) => (
                                        <SelectItem key={tz} value={tz}>
                                            {tz}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Warning Minutes */}
                        <div className="grid gap-2">
                            <Label htmlFor="warning">
                                In-Game Warning Time
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                {
                                    'How long before the restart to start sending in-game countdown warnings.'
                                }
                            </p>
                            <Select
                                value={warningMinutes}
                                onValueChange={setWarningMinutes}
                            >
                                <SelectTrigger id="warning">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {WARNING_OPTIONS.map((opt) => (
                                        <SelectItem
                                            key={opt.value}
                                            value={opt.value}
                                        >
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Discord Reminder Minutes */}
                        <div className="grid gap-2">
                            <Label htmlFor="discord-reminder">
                                Discord Reminder
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                {
                                    'How far ahead Discord gets an early heads up notification.'
                                }
                            </p>
                            <Select
                                value={discordReminderMinutes}
                                onValueChange={setDiscordReminderMinutes}
                            >
                                <SelectTrigger id="discord-reminder">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {DISCORD_REMINDER_OPTIONS.map((opt) => (
                                        <SelectItem
                                            key={opt.value}
                                            value={opt.value}
                                        >
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Warning Message */}
                        <div className="grid gap-2">
                            <Label htmlFor="warning-message">
                                Warning Message (optional)
                            </Label>
                            <Input
                                id="warning-message"
                                value={warningMessage}
                                onChange={(e) =>
                                    setWarningMessage(e.target.value)
                                }
                                placeholder="restart (automatic)"
                                maxLength={500}
                            />
                            <p className="text-sm text-muted-foreground">
                                {
                                    'Custom label for countdown warnings. Default: "restart (automatic)"'
                                }
                            </p>
                        </div>

                        <Separator />

                        <Button onClick={save} disabled={saving}>
                            {saving ? 'Saving...' : 'Save Settings'}
                        </Button>
                    </CardContent>
                </Card>

                {/* Schedule Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="size-5" />
                            Daily Schedule
                        </CardTitle>
                        <CardDescription>
                            {`Add up to 5 daily restart times. Times are in ${settings.timezone}.`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Existing times */}
                        {schedule.length > 0 ? (
                            <div className="space-y-2">
                                {schedule.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className="flex items-center justify-between rounded-md border border-border px-4 py-3"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-lg font-semibold">
                                                {entry.time}
                                            </span>
                                            {!entry.enabled && (
                                                <Badge variant="secondary">
                                                    Disabled
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={entry.enabled}
                                                onCheckedChange={() =>
                                                    toggleTime(entry.id)
                                                }
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() =>
                                                    deleteTime(entry.id)
                                                }
                                            >
                                                <Trash2 className="size-4 text-destructive" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No restart times configured. Add one below.
                            </p>
                        )}

                        <Separator />

                        {/* Add new time */}
                        <div className="flex items-end gap-3">
                            <div className="grid gap-2">
                                <Label htmlFor="new-time">{'Add Time'}</Label>
                                <Input
                                    id="new-time"
                                    type="time"
                                    value={newTime}
                                    onChange={(e) => setNewTime(e.target.value)}
                                    disabled={schedule.length >= 5}
                                />
                            </div>
                            <Button
                                onClick={addTime}
                                disabled={
                                    !newTime ||
                                    addingTime ||
                                    schedule.length >= 5
                                }
                            >
                                <Plus className="mr-1.5 size-4" />
                                {addingTime ? 'Adding...' : 'Add'}
                            </Button>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            {`${String(schedule.length)}/5 slots used`}
                        </p>

                        {/* Next Restart Info */}
                        {next_restart_at && (
                            <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
                                {'Next restart:'}{' '}
                                <span className="font-semibold">
                                    {new Date(next_restart_at).toLocaleString()}
                                </span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
