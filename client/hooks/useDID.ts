import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";

export function useDID() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myDID, setMyDID] = useState<any>(null);
  const [myVCs, setMyVCs] = useState<any[]>([]);
  const { user, role } = useAuth();

  useEffect(() => {
    if (user) {
      fetchMyDID();
      fetchMyVCs();
    }
  }, [user]);

  const fetchMyDID = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/did/user/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setMyDID(data);
      }
    } catch (err) {
      console.error("Failed to fetch DID:", err);
    }
  };

  const fetchMyVCs = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/did/vc/user/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setMyVCs(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch VCs:", err);
    }
  };

  const generateDID = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/did/generate", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": role || 'user'
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate DID");
      setMyDID(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const resolveDID = async (did: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/did/resolve/${encodeURIComponent(did)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resolve DID");
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const verifyVC = async (vc: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/did/vc/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vc })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to verify VC");
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { generateDID, resolveDID, verifyVC, myDID, myVCs, loading, error, refresh: fetchMyVCs };
}
