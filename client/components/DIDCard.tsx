import { motion } from "framer-motion";
import { Copy, Download, CheckCircle, Shield, QrCode, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useDID } from "../hooks/useDID";
import { Barcode } from "./Barcode";

export function DIDCard({ didData, vcs }: { didData: any, vcs: any[] }) {
  const [copied, setCopied] = useState(false);
  const { verifyVC } = useDID();
  const [verificationStatus, setVerificationStatus] = useState<Record<string, boolean>>({});

  const handleCopy = () => {
    navigator.clipboard.writeText(didData.did);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async (vc: any) => {
    const result = await verifyVC(vc.vc_json);
    setVerificationStatus(prev => ({ ...prev, [vc.id]: result.verified }));
  };

  const downloadVC = (vc: any) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(vc.vc_json, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `vc_${vc.credential_type}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  if (!didData) return null;

  const truncateDID = (did: string) => {
    if (did.length < 20) return did;
    return `${did.slice(0, 15)}...${did.slice(-6)}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/60 backdrop-blur-md border border-slate-200/60 shadow-xl rounded-2xl overflow-hidden"
    >
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-6 w-6" />
            <h2 className="text-xl font-bold">Identity Wallet</h2>
          </div>
          <p className="text-blue-100 text-sm">W3C Decentralized Identifier (DID)</p>
        </div>
        <div className="bg-white/90 p-3 rounded-lg flex items-center justify-center">
          <QrCode className="h-12 w-12 text-indigo-700" />
        </div>
      </div>

      <div className="p-6">
        <div className="mb-6">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Your DID</p>
          <div className="flex items-center justify-between bg-slate-100 p-3 rounded-lg border border-slate-200 mb-4">
            <span className="font-mono text-sm text-slate-800 break-all">{truncateDID(didData.did)}</span>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="text-slate-500 hover:text-slate-900 h-8 px-2">
              {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
            Identity Barcode (Code 128)
          </p>
          <Barcode value={didData.did} displayValue={true} height={50} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-800">Verifiable Credentials ({vcs.length})</p>
          </div>
          
          {vcs.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
              <Shield className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No credentials issued yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {vcs.map((vc) => (
                <div key={vc.id} className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm transition-all hover:shadow-md">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded mb-1">
                        {vc.credential_type}
                      </span>
                      <p className="text-xs text-slate-500 font-mono" title={vc.issuer_did}>
                        Issuer: {truncateDID(vc.issuer_did)}
                      </p>
                    </div>
                    {verificationStatus[vc.id] !== undefined && (
                      <span className={`flex items-center text-xs font-bold ${verificationStatus[vc.id] ? "text-green-600" : "text-red-600"}`}>
                        {verificationStatus[vc.id] ? "VERIFIED" : "INVALID"}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => handleVerify(vc)}>
                      Verify Signature
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => downloadVC(vc)}>
                      <Download className="h-3 w-3 mr-1" /> JSON-LD
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
