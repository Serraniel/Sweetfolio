/** Toasts and progress tasks (UI-7). */

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
	id: number;
	kind: ToastKind;
	message: string;
	action?: { label: string; href?: string; run?: () => void };
}

export interface Task {
	id: string;
	label: string;
	detail: string;
	current: number;
	total: number;
	done: boolean;
	errors: string[];
	summary?: string;
}

let counter = 0;

class Notifications {
	toasts = $state<Toast[]>([]);
	tasks = $state<Task[]>([]);

	show(message: string, kind: ToastKind = 'info', options: { action?: Toast['action']; timeout?: number } = {}) {
		const id = ++counter;
		this.toasts = [...this.toasts, { id, kind, message, action: options.action }];
		const timeout = options.timeout ?? (kind === 'error' ? 8000 : 4000);
		if (timeout > 0) setTimeout(() => this.dismiss(id), timeout);
		return id;
	}

	success(message: string, action?: Toast['action']) {
		return this.show(message, 'success', { action });
	}

	error(message: string) {
		return this.show(message, 'error');
	}

	dismiss(id: number) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	startTask(id: string, label: string, total = 0): Task {
		const task: Task = { id, label, detail: '', current: 0, total, done: false, errors: [] };
		this.tasks = [...this.tasks.filter((t) => t.id !== id), task];
		return this.tasks.find((t) => t.id === id)!;
	}

	updateTask(id: string, patch: Partial<Task>) {
		this.tasks = this.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
	}

	finishTask(id: string, summary?: string, errors: string[] = []) {
		this.updateTask(id, { done: true, summary, errors });
		if (!errors.length) setTimeout(() => this.dismissTask(id), 4000);
	}

	dismissTask(id: string) {
		this.tasks = this.tasks.filter((t) => t.id !== id);
	}
}

export const notify = new Notifications();
