import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { auth as authApi, UNAUTHORISED_EVENT } from "./api";

type AuthState = "checking" | "signed-in" | "signed-out";

interface AuthContextValue {
  state: AuthState;
  signIn: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("checking");

  useEffect(() => {
    let cancelled = false;
    authApi
      .check()
      .then((result) => {
        if (!cancelled) setState(result.authenticated ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (!cancelled) setState("signed-out");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Any 401 from anywhere in the app drops us back to the login screen.
  useEffect(() => {
    const onUnauthorised = () => setState("signed-out");
    window.addEventListener(UNAUTHORISED_EVENT, onUnauthorised);
    return () => window.removeEventListener(UNAUTHORISED_EVENT, onUnauthorised);
  }, []);

  const signIn = useCallback(async (password: string) => {
    await authApi.login(password);
    setState("signed-in");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setState("signed-out");
    }
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}
