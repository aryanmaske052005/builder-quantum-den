import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { DashboardLayout } from '../components/DashboardLayout';
import { IssueVCDialog } from '../components/IssueVCDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, CheckCircle, FileText, ExternalLink, CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Fingerprint } from 'lucide-react';

export default function MedicalDashboard() {
  const { user, role } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [vcDialogDoc, setVcDialogDoc] = useState<any | null>(null);
  const [vcIssuing, setVcIssuing] = useState(false);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('kyc_documents')
        .select(`*, profiles:user_id (full_name, email)`)
        .eq('doc_type', 'medical')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      toast.error('Error fetching data', { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (user) fetchDocuments(); }, [user]);

  const handleAction = async (docId: string, status: 'approved' | 'rejected', targetUserId: string) => {
    if (!user) return;
    setActionLoading(docId);
    try {
      const remarks = prompt(`Enter medical assessment remarks for ${status}:`) || '';
      const { error } = await supabase.from('kyc_documents')
        .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString(), remarks })
        .eq('id', docId);
      if (error) throw error;
      await supabase.from('audit_logs').insert({ action: `MEDICAL_DOC_${status.toUpperCase()}`, performed_by: user.id, target_user: targetUserId, document_id: docId, metadata: { remarks } });
      if (status === 'approved') {
        const fd = new FormData();
        fd.append('data', JSON.stringify({ name: 'System Approval', email: 'system@authenledger.com', phone: '0000000000', pan: 'ABCDE1234F', dateOfBirth: '2000-01-01', address: { street: 'NA', city: 'NA', state: 'NA', pincode: '000000', country: 'NA' }, action: 'record_approval', docId }));
        fd.append('documents', new File([''], 'placeholder.pdf', { type: 'application/pdf' }));
        const res = await fetch('/api/kyc/submit', { method: 'POST', body: fd });
        if (res.ok) { const d = await res.json(); if (d.success && d.data?.blockchainTxHash) await supabase.from('kyc_documents').update({ blockchain_tx_hash: d.data.blockchainTxHash }).eq('id', docId); }
      }
      toast.success(`Health document ${status}`);
      fetchDocuments();
    } catch (error: any) {
      toast.error('Action failed', { description: error.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleIssueVC = async (docId: string, targetUserId: string, expiryDate: string) => {
    if (!user) return;
    setVcIssuing(true);
    try {
      const expiryDays = Math.max(1, Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000));
      const res = await fetch('/api/did/vc/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': role || '' },
        body: JSON.stringify({ holderUserId: targetUserId, credentialType: 'MedicalCredential', claims: { docId, status: 'Verified', institution: 'Health Department', expiryDate }, expiryDays })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await supabase.from('kyc_documents').update({ expiry_date: expiryDate }).eq('id', docId);
      await supabase.from('audit_logs').insert({ action: 'VC_ISSUED', performed_by: user.id, target_user: targetUserId, document_id: docId, metadata: { expiry_date: expiryDate, vc_id: data.vc?.id } });
      toast.success(`Medical VC issued! Expires ${new Date(expiryDate).toLocaleDateString()}`);
      setVcDialogDoc(null);
      fetchDocuments();
    } catch (err: any) {
      toast.error('Failed to issue VC', { description: err.message });
    } finally {
      setVcIssuing(false);
    }
  };

  return (
    <DashboardLayout title="Medical Portal">
      {vcDialogDoc && <IssueVCDialog doc={vcDialogDoc} credentialType="Medical Credential" authorityLabel="Health Department" accentColor="red" defaultExpiryYears={1} onClose={() => setVcDialogDoc(null)} onIssue={handleIssueVC} isLoading={vcIssuing} />}
      <Card className="shadow-sm border-red-100">
        <CardHeader>
          <CardTitle className="text-xl text-red-900">Health Record Verification</CardTitle>
          <CardDescription>Review medical certificates and health insurance claims</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-red-600" /></div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-slate-500"><CheckCircle className="h-12 w-12 mx-auto mb-3 text-slate-300" /><p>No medical documents pending review</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>Submission Date</TableHead>
                    <TableHead>Expiry Set</TableHead>
                    <TableHead>Certificate</TableHead>
                    <TableHead className="text-right">Assessment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{doc.profiles?.full_name || 'Unknown'}</div>
                        <div className="text-xs text-slate-500">{doc.profiles?.email}</div>
                      </TableCell>
                      <TableCell>{new Date(doc.submitted_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {doc.expiry_date
                          ? <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5"><CalendarDays className="h-3 w-3" />{new Date(doc.expiry_date).toLocaleDateString()}</span>
                          : <span className="text-xs text-slate-400">—</span>}
                      </TableCell>
                      <TableCell>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50"><FileText className="h-4 w-4 mr-2" />View Record<ExternalLink className="h-3 w-3 ml-1" /></Button>
                        </a>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {doc.status === 'pending' ? (
                          <>
                            <Button variant="outline" size="sm" className="bg-slate-50 text-slate-600" onClick={() => handleAction(doc.id, 'rejected', doc.user_id)} disabled={actionLoading === doc.id}>Reject</Button>
                            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => handleAction(doc.id, 'approved', doc.user_id)} disabled={actionLoading === doc.id}>
                              {actionLoading === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Certify'}
                            </Button>
                          </>
                        ) : doc.status === 'approved' ? (
                          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setVcDialogDoc(doc)}>
                            <Fingerprint className="h-4 w-4 mr-2" />Issue VC
                          </Button>
                        ) : <Badge variant="outline" className="text-slate-500 uppercase">{doc.status}</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
