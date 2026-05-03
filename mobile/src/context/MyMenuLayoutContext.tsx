import { createContext, useContext } from 'react';

export type MyMenuTab = 'dashboard' | 'calendar' | 'shopping' | 'planner';

export type MyMenuLayoutValue = {
    menuId: string | null;
    setMenuId: (id: string | null) => void;
    listId: string | null;
    setListId: (id: string | null) => void;
    activeTab: MyMenuTab;
    setTab: (t: MyMenuTab) => void;
};

export const MyMenuLayoutContext = createContext<MyMenuLayoutValue | null>(null);

export function useMyMenuLayout() {
    return useContext(MyMenuLayoutContext);
}
