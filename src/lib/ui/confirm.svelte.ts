/** Promise-based confirmation dialog service (used instead of window.confirm). */
export interface ConfirmRequest {
	title: string;
	message: string;
	confirmLabel?: string;
	danger?: boolean;
	/** Require typing this text to confirm (DP-4). */
	typed?: string;
}

class ConfirmService {
	current = $state<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null);

	ask(req: ConfirmRequest): Promise<boolean> {
		this.current?.resolve(false);
		return new Promise((resolve) => (this.current = { ...req, resolve }));
	}

	answer(ok: boolean) {
		const c = this.current;
		this.current = null;
		c?.resolve(ok);
	}
}

export const confirmService = new ConfirmService();
export const confirmAction = (req: ConfirmRequest) => confirmService.ask(req);
