import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { DashboardLayout } from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, CheckCircle, Search, Building2, AlertTriangle, ExternalLink, CalendarDays, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Fingerprint } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ──────────────────────────────────────────────
// Issue-VC Dialog (inline, no extra library)
// ──────────────────────────────────────────────
interface IssueVCDialogProps {
  doc: any;
  onClose: () => void;
  onIssue: (docId: string, userId: string, expiryDate: string) => Promise<void>;
  isLoading: boolean;
}

function IssueVCDialog({ doc, onClose, onIssue, isLoading }: IssueVCDialogProps) {
  // Default: 10 years from today
  const defaultExpiry = new Date();
  defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 10);
  const defaultStr = defaultExpiry.toISOString().split('T')[0];

  const [expiryDate, setExpiryDate] = useState(defaultStr);

  // today's date string for min attribute
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <Fingerprint className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Issue Verifiable Credential</h2>
                <p className="text-indigo-200 text-sm">Set the credential expiry date</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="bg-white/20 hover:bg-white/30 rounded-full p-1.5 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Citizen info */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-1 border border-slate-100">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Citizen</p>
            <p className="font-semibold text-slate-800">{doc.profiles?.full_name || 'Unknown'}</p>
            <p className="text-sm text-slate-500">{doc.profiles?.email}</p>
            <Badge className="mt-1 bg-amber-100 text-amber-800 hover:bg-amber-100 capitalize">
              {doc.doc_type.replace('_', ' ')}
            </Badge>
          </div>

          {/* Expiry date picker */}
          <div className="space-y-2">
            <Label htmlFor="vc-expiry" className="flex items-center gap-2 text-slate-700 font-medium">
              <CalendarDays className="h-4 w-4 text-indigo-500" />
              Credential Expiry Date
            </Label>
            <Input
              id="vc-expiry"
              type="date"
              min={today}
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="border-slate-200 focus:border-indigo-400 focus:ring-indigo-400"
            />
            <p className="text-xs text-slate-400">
              The credential will automatically expire on this date.
            </p>
          </div>

          {/* Quick presets */}
          <div className="space-y-1.5">
            <p className="text-xs text-slate-500 font-medium">Quick select:</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '1 Year', years: 1 },
                { label: '3 Years', years: 3 },
                { label: '5 Years', years: 5 },
                { label: '10 Years', years: 10 },
              ].map(({ label, years }) => {
                const d = new Date();
                d.setFullYear(d.getFullYear() + years);
                const val = d.toISOString().split('T')[0];
                return (
                  <button
                    key={label}
                    onClick={() => setExpiryDate(val)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      expiryDate === val
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={() => onIssue(doc.id, doc.user_id, expiryDate)}
            disabled={isLoading || !expiryDate}
          >
            {isLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Issuing...</>
            ) : (
              <><Fingerprint className="h-4 w-4 mr-2" /> Issue VC</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Government Dashboard
// ──────────────────────────────────────────────
export default function GovernmentDashboard() {
  const { user, role } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [allUsersKyc, setAllUsersKyc] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // VC dialog state
  const [vcDialogDoc, setVcDialogDoc] = useState<any | null>(null);
  const [vcIssuing, setVcIssuing] = useState(false);

  const fetchData = async () => {
    try {
      const { data: docs, error: docsError } = await supabase
        .from('kyc_documents')
        .select(`*, profiles:user_id (full_name, email)`)
        .in('doc_type', ['aadhaar', 'pan', 'government_doc'])
        .order('submitted_at', { ascending: false });

      if (docsError) throw docsError;

      const { data: allDocs, error: allDocsError } = await supabase
        .from('kyc_documents')
        .select('id, user_id, doc_type, status');

      if (allDocsError) throw allDocsError;

      const enrichedDocs = docs?.map(doc => {
        const userOtherDocs = allDocs?.filter(d => d.user_id === doc.user_id && d.id !== doc.id) || [];
        return { ...doc, otherDocs: userOtherDocs };
      });

      setDocuments(enrichedDocs || []);

      const usersMap = new Map();
      allDocs?.forEach(d => {
        if (!usersMap.has(d.user_id)) {
          usersMap.set(d.user_id, { user_id: d.user_id, total: 0, approved: 0, rejected: 0, pending: 0 });
        }
        const u = usersMap.get(d.user_id);
        u.total++;
        if (d.status === 'approved') u.approved++;
        if (d.status === 'rejected') u.rejected++;
        if (d.status === 'pending') u.pending++;
      });
      setAllUsersKyc(Array.from(usersMap.values()));

    } catch (error: any) {
      toast.error('Error fetching data', { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const handleAction = async (docId: string, status: 'approved' | 'rejected', targetUserId: string, docType: string) => {
    if (!user) return;
    setActionLoading(docId);

    try {
      if (status === 'approved') {
        if (docType === 'aadhaar') {
          const val = prompt('Please verify and enter the 12-digit Aadhaar number from the document:');
          if (!val) { setActionLoading(null); return; }
          if (!/^\d{12}$/.test(val)) {
            toast.error('Validation Failed', { description: 'Aadhaar must be exactly 12 digits.' });
            setActionLoading(null);
            return;
          }
        } else if (docType === 'pan') {
          const val = prompt('Please verify and enter the PAN number from the document:');
          if (!val) { setActionLoading(null); return; }
          if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(val)) {
            toast.error('Validation Failed', { description: 'Invalid PAN format.' });
            setActionLoading(null);
            return;
          }
        }
      }

      const remarks = prompt(`Enter official remarks for ${status}:`) || '';

      const { error: updateError } = await supabase
        .from('kyc_documents')
        .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString(), remarks })
        .eq('id', docId);

      if (updateError) throw updateError;

      await supabase.from('audit_logs').insert({
        action: `GOV_DOC_${status.toUpperCase()}`,
        performed_by: user.id,
        target_user: targetUserId,
        document_id: docId,
        metadata: { remarks }
      });

      if (status === 'approved') {
        const formData = new FormData();
        formData.append('data', JSON.stringify({
          name: 'System Approval',
          email: 'system@authenledger.com',
          phone: '0000000000',
          pan: 'ABCDE1234F',
          dateOfBirth: '2000-01-01',
          address: { street: 'NA', city: 'NA', state: 'NA', pincode: '000000', country: 'NA' },
          action: 'record_approval',
          docId: docId
        }));
        formData.append('documents', new File([''], 'placeholder.pdf', { type: 'application/pdf' }));
        const response = await fetch('/api/kyc/submit', { method: 'POST', body: formData });
        if (response.ok) {
          const resData = await response.json();
          if (resData.success && resData.data?.blockchainTxHash) {
            await supabase.from('kyc_documents').update({ blockchain_tx_hash: resData.data.blockchainTxHash }).eq('id', docId);
          }
        }
      }

      toast.success(`Identity document ${status}`);
      fetchData();
    } catch (error: any) {
      toast.error(`Action failed`, { description: error.message });
    } finally {
      setActionLoading(null);
    }
  };

  // Called when admin confirms the expiry date in the dialog
  const handleIssueVC = async (docId: string, targetUserId: string, expiryDate: string) => {
    if (!user) return;
    setVcIssuing(true);
    try {
      // Calculate expiryDays from the chosen date
      const expiry = new Date(expiryDate);
      const today = new Date();
      const diffMs = expiry.getTime() - today.getTime();
      const expiryDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      const response = await fetch("/api/did/vc/issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": role || ""
        },
        body: JSON.stringify({
          holderUserId: targetUserId,
          credentialType: "GovernmentIDCredential",
          claims: { docId, status: "Verified", authority: "Government of India", expiryDate },
          expiryDays
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      // Persist expiry_date back to kyc_documents so the user portal can display it
      const { error: updateErr } = await supabase
        .from('kyc_documents')
        .update({ expiry_date: expiryDate })
        .eq('id', docId);

      if (updateErr) {
        console.warn('Could not save expiry_date to kyc_documents:', updateErr.message);
      }

      await supabase.from('audit_logs').insert({
        action: 'VC_ISSUED',
        performed_by: user.id,
        target_user: targetUserId,
        document_id: docId,
        metadata: { expiry_date: expiryDate, vc_id: data.vc?.id }
      });

      toast.success(`Verifiable Credential issued! Expires on ${new Date(expiryDate).toLocaleDateString()}`, {
        description: `VC ID: ${data.vc?.id}`
      });
      setVcDialogDoc(null);
      fetchData();
    } catch (err: any) {
      toast.error("Failed to issue VC", { description: err.message });
    } finally {
      setVcIssuing(false);
    }
  };

  const filteredDocs = documents.filter(doc =>
    doc.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.profiles?.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout title="Government Authority Portal">
      {/* VC Issue Dialog */}
      {vcDialogDoc && (
        <IssueVCDialog
          doc={vcDialogDoc}
          onClose={() => setVcDialogDoc(null)}
          onIssue={handleIssueVC}
          isLoading={vcIssuing}
        />
      )}

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="mb-6 grid w-full max-w-md grid-cols-2 bg-slate-200">
          <TabsTrigger value="pending" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white">Identity Verification</TabsTrigger>
          <TabsTrigger value="master" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white">Master Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card className="shadow-sm border-amber-200">
            <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4">
              <div>
                <CardTitle className="text-xl text-amber-900">National ID Verification Queue</CardTitle>
                <CardDescription>Review Aadhaar, PAN, and official government IDs</CardDescription>
              </div>
              <div className="relative w-full md:w-64 mt-4 md:mt-0">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Search citizen..."
                  className="pl-9 bg-slate-50"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-amber-600" /></div>
              ) : filteredDocs.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Building2 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p>All citizen identities verified</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Citizen</TableHead>
                        <TableHead>ID Type</TableHead>
                        <TableHead>Cross Reference</TableHead>
                        <TableHead>Document</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocs.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell>
                            <div className="font-medium text-slate-900">{doc.profiles?.full_name || 'Unknown'}</div>
                            <div className="text-xs text-slate-500">{doc.profiles?.email}</div>
                          </TableCell>
                          <TableCell className="capitalize font-medium text-amber-700">{doc.doc_type.replace('_', ' ')}</TableCell>
                          <TableCell>
                            {doc.otherDocs?.length > 0 ? (
                              <div className="flex gap-1 flex-wrap">
                                {doc.otherDocs.map((od: any, i: number) => (
                                  <Badge key={i} variant="outline" className={`text-[10px] ${od.status === 'approved' ? 'text-green-600 border-green-200' : od.status === 'rejected' ? 'text-red-600 border-red-200' : 'text-slate-500'}`}>
                                    {od.doc_type.slice(0, 3)}:{od.status[0].toUpperCase()}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">No other records</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                              <Button variant="outline" size="sm" className="text-blue-600">
                                View <ExternalLink className="h-3 w-3 ml-1" />
                              </Button>
                            </a>
                          </TableCell>
                          <TableCell>
                            {doc.expiry_date ? (
                              <span className="text-xs text-slate-600 flex items-center gap-1">
                                <CalendarDays className="h-3 w-3 text-indigo-400" />
                                {new Date(doc.expiry_date).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {doc.status === 'pending' ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:bg-red-50"
                                  onClick={() => handleAction(doc.id, 'rejected', doc.user_id, doc.doc_type)}
                                  disabled={actionLoading === doc.id}
                                >
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-amber-600 hover:bg-amber-700 text-white"
                                  onClick={() => handleAction(doc.id, 'approved', doc.user_id, doc.doc_type)}
                                  disabled={actionLoading === doc.id}
                                >
                                  {actionLoading === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validate'}
                                </Button>
                              </>
                            ) : doc.status === 'approved' ? (
                              <Button
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                onClick={() => setVcDialogDoc(doc)}
                                disabled={actionLoading === `vc-${doc.id}`}
                              >
                                <Fingerprint className="h-4 w-4 mr-2" /> Issue VC
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-slate-500 uppercase">{doc.status}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="master">
          <Card>
            <CardHeader>
              <CardTitle>Global Citizen KYC Status</CardTitle>
              <CardDescription>Aggregate view of compliance across all sectors</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Total Submissions</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Rejected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allUsersKyc.map((u, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{u.user_id}</TableCell>
                      <TableCell className="font-medium">{u.total}</TableCell>
                      <TableCell className="text-green-600">{u.approved}</TableCell>
                      <TableCell className="text-amber-600">{u.pending}</TableCell>
                      <TableCell className="text-red-600">{u.rejected}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
