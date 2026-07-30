import { Head } from '@inertiajs/react';
import { Activity, Pause, Play, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

export default function Logs({ lines: initialLines }: { lines: string[] }) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Server Logs', href: '/admin/logs' },
    ];
    const [lines, setLines] = useState(initialLines);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [tail, setTail] = useState('100');
    const [refreshing, setRefreshing] = useState(false);
    const outputRef = useRef<HTMLDivElement>(null);

    const fetchLogs = useCallback(() => {
        setRefreshing(true);
        fetch(`/admin/logs/fetch?tail=${tail}`)
            .then((r) => r.json())
            .then((data) => {
                if (data.lines) {
                    setLines(data.lines);
                }
            })
            .catch(() => {})
            .finally(() => setRefreshing(false));
    }, [tail]);

    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(fetchLogs, 5000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchLogs]);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [lines]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Server Logs" />
            <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Server Logs
                        </h1>
                        <p className="text-muted-foreground">
                            Live game server container output
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            value={tail}
                            onValueChange={(v) => {
                                setTail(v);
                            }}
                        >
                            <SelectTrigger className="w-[120px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="50">
                                    {`${'50'} lines`}
                                </SelectItem>
                                <SelectItem value="100">
                                    {`${'100'} lines`}
                                </SelectItem>
                                <SelectItem value="200">
                                    {`${'200'} lines`}
                                </SelectItem>
                                <SelectItem value="500">
                                    {`${'500'} lines`}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAutoRefresh(!autoRefresh)}
                        >
                            {autoRefresh ? (
                                <>
                                    <Pause className="mr-1.5 size-3.5" />{' '}
                                    {'Pause'}
                                </>
                            ) : (
                                <>
                                    <Play className="mr-1.5 size-3.5" />{' '}
                                    {'Resume'}
                                </>
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchLogs}
                            disabled={refreshing}
                        >
                            <RefreshCw
                                className={`mr-1.5 size-3.5 ${refreshing ? 'animate-spin' : ''}`}
                            />
                            Refresh
                        </Button>
                    </div>
                </div>

                <Card className="flex flex-1 flex-col">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="size-5" />
                                Container Output
                            </CardTitle>
                            <CardDescription>
                                {`${String(lines.length)} lines`}
                            </CardDescription>
                        </div>
                        {autoRefresh && (
                            <Badge variant="outline" className="text-xs">
                                <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-green-500" />
                                Auto-refresh
                            </Badge>
                        )}
                    </CardHeader>
                    <CardContent className="flex-1">
                        <div
                            ref={outputRef}
                            className="max-h-[70vh] min-h-[500px] overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-relaxed"
                        >
                            {lines.length > 0 ? (
                                lines.map((line, i) => (
                                    <div
                                        key={i}
                                        className="text-zinc-300 hover:bg-zinc-900/50"
                                    >
                                        <span className="mr-3 text-zinc-600 select-none">
                                            {i + 1}
                                        </span>
                                        {line}
                                    </div>
                                ))
                            ) : (
                                <p className="text-zinc-500">
                                    No log output available
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
