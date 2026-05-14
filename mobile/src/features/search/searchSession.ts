const SK = 'myshop_search_session_id';

export function getSearchSessionId(): string {
    try {
        let id = sessionStorage.getItem(SK);
        if (!id) {
            id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
            sessionStorage.setItem(SK, id);
        }
        return id;
    } catch {
        return `s_${Date.now()}`;
    }
}
