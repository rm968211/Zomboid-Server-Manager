import type { RequestPayload } from '@inertiajs/core';
import { createInertiaApp, router } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../css/app.css';
import { initializeTheme } from './hooks/use-appearance';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

// Session-expired (419) recovery: refresh the CSRF cookie and retry the
// visit once, transparently. If it still fails, fall back to a full reload.
type RetryVisit = {
    url: URL;
    method: 'get' | 'post' | 'put' | 'patch' | 'delete';
    data: RequestPayload;
};
let lastVisit: RetryVisit | null = null;
let retrying = false;

router.on('before', (event) => {
    if (!retrying) {
        lastVisit = event.detail.visit as RetryVisit;
    }
});

router.on('invalid', (event) => {
    if (event.detail.response.status !== 419) {
        return;
    }
    event.preventDefault();

    if (retrying || !lastVisit) {
        window.location.reload();
        return;
    }

    retrying = true;
    const { url, method, data } = lastVisit;
    fetch('/sanctum/csrf-cookie', { credentials: 'same-origin' }).finally(() => {
        router.visit(url, {
            method,
            data,
            preserveState: true,
            preserveScroll: true,
            onFinish: () => {
                retrying = false;
            },
        });
    });
});

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    resolve: (name) =>
        resolvePageComponent(
            `./pages/${name}.tsx`,
            import.meta.glob('./pages/**/*.tsx'),
        ),
    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(
            <StrictMode>
                <App {...props} />
            </StrictMode>,
        );
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();
