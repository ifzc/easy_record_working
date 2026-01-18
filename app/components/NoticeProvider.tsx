"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { toast } from "./ui/use-toast";
import { Toaster } from "./ui/toaster";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

type NoticeType = "info" | "success" | "warning" | "error";

type ConfirmOptions = {
  confirmText?: string;
  cancelText?: string;
  type?: NoticeType;
};

type NoticeContextValue = {
  notify: (message: string, type?: NoticeType, durationMs?: number) => void;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
};

type ConfirmState = {
  message: string;
  type: NoticeType;
  confirmText: string;
  cancelText: string;
  resolve: (value: boolean) => void;
};

const NoticeContext = createContext<NoticeContextValue | null>(null);

const typeToVariant: Record<NoticeType, "default" | "destructive"> = {
  info: "default",
  success: "default",
  warning: "default",
  error: "destructive",
};

const confirmTitleMap: Record<NoticeType, string> = {
  info: "提示",
  success: "提示",
  warning: "请确认",
  error: "请确认",
};

const noticeTitleMap: Record<NoticeType, string> = {
  info: "提示",
  success: "成功",
  warning: "提醒",
  error: "失败",
};

export function useNotice() {
  const context = useContext(NoticeContext);
  if (!context) {
    throw new Error("useNotice must be used within NoticeProvider");
  }
  return context;
}

export default function NoticeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const confirmRef = useRef<ConfirmState | null>(null);

  const notify = useCallback(
    (message: string, type: NoticeType = "info", durationMs = 3000) => {
      const duration = durationMs <= 0 ? 0 : durationMs;
      toast({
        title: noticeTitleMap[type],
        description: message,
        variant: typeToVariant[type],
        duration,
      });
    },
    [],
  );

  const confirm = useCallback(
    (message: string, options?: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        const nextState: ConfirmState = {
          message,
          type: options?.type ?? "warning",
          confirmText: options?.confirmText ?? "确认",
          cancelText: options?.cancelText ?? "取消",
          resolve,
        };
        confirmRef.current = nextState;
        setConfirmState(nextState);
      }),
    [],
  );

  const closeConfirm = useCallback((result: boolean) => {
    const current = confirmRef.current;
    if (!current) {
      return;
    }
    confirmRef.current = null;
    current.resolve(result);
    setConfirmState(null);
  }, []);

  const contextValue = useMemo(
    () => ({
      notify,
      confirm,
    }),
    [notify, confirm],
  );

  return (
    <NoticeContext.Provider value={contextValue}>
      {children}
      <Toaster />
      <AlertDialog
        open={Boolean(confirmState)}
        onOpenChange={(open) => {
          if (!open && confirmState) {
            closeConfirm(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmState ? confirmTitleMap[confirmState.type] : "提示"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmState?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => closeConfirm(false)}>
              {confirmState?.cancelText ?? "取消"}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => closeConfirm(true)}>
              {confirmState?.confirmText ?? "确认"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NoticeContext.Provider>
  );
}
