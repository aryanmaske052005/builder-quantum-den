import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { DashboardLayout } from '../components/DashboardLayout';
import { IssueVCDialog } from '../components/IssueVCDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Search, CheckCircle, XCircle, Clock, FileText, ExternalLink, CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Fingerprint } from 'lucide-react';

export default function PrincipalDashboard() {
  const { user, role } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [stats, setStats] = useState({ pending: 0, approvedToday: 0, rejected: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [vcDialogDoc, setVcDialogDoc] = useState<any | null>(null);
  const [vcIssuing, setVcIssuing] = useState(false);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('kyc_documents')
        .select(`*, profiles:user_id (full_name, email)`)
        .eq('doc_type', 'marksheet')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      setDocuments(data || []);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      setStats({
        pending: data?.filter(d => d.status === 'pending').length || 0,
        rejected: data?.filter(d => d.status === 'rejected').length || 0,
        approvedToday: data?.filter(d => d.status === 'approved' && d.reviewed_at && new Date(d.reviewed_at) >= today).length || 0,
      });
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
      const remarks = prompt(`Enter remarks for ${status === 'approved' ? 'approval' : 'rejection'}:`) || '';
      const { error } = await supabase.from('kyc_documents')
        .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString(), remarks })
        .eq('id', docId);
      if (error) throw error;
      await supabase.from('audit_logs').insert({ action: `DOCUMENT_${status.toUpperCase()}`, performed_by: user.id, target_user: targetUserId, document_id: docId, metadata: { remarks } });
      if (status === 'approved') {
        const fd = new FormData();
        fd.append('data', JSON.stringify({ name: 'System Approval', email: 'system@authenledger.com', phone: '0000000000', pan: 'ABCDE1234F', dateOfBirth: '2000-01-01', address: { street: 'NA', city: 'NA', state: 'NA', pincode: '000000', country: 'NA' }, action: 'record_approval', docId }));
        fd.append('documents', new File([''], 'placeholder.pdf', { type: 'application/pdf' }));
        const res = await fetch('/api/kyc/submit', { method: 'POST', body: fd });
        if (res.ok) { const d = await res.json(); if (d.success && d.data?.blockchainTxHash) await supabase.from('kyc_documents').update({ blockchain_tx_hash: d.data.blockchainTxHash }).eq('id', docId); }
      }
      toast.success(`Document ${status} successfully`);
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
        body: JSON.stringify({ holderUserId: targetUserId, credentialType: 'MarksheetCredential', claims: { docId, status: 'Verified', institution: 'Educational Board', expiryDate }, expiryDays })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await supabase.from('kyc_documents').update({ expiry_date: expiryDate }).eq('id', docId);
      await supabase.from('audit_logs').insert({ action: 'VC_ISSUED', performed_by: user.id, target_user: targetUserId, document_id: docId, metadata: { expiry_date: expiryDate, vc_id: data.vc?.id } });
      toast.success(`Academic VC issued! Expires ${new Date(expiryDate).toLocaleDateString()}`);
      setVcDialogDoc(null);
      fetchDocuments();
    } catch (err: any) {
      toast.error('Failed to issue VC', { description: err.message });
    } finally {
      setVcIssuing(false);
    }
  };

  const filteredDocs = documents.filter(doc =>
    doc.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout title="Principal Portal">
      {vcDialogDoc && <IssueVCDialog doc={vcDialogDoc} credentialType="Marksheet Credential" authorityLabel="Educational Board" accentColor="purple" defaultExpiryYears={5} onClose={() => setVcDialogDoc(null)} onIssue={handleIssueVC} isLoading={vcIssuing} />}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="shadow-sm border-purple-100">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="bg-purple-100 p-3 rounded-full text-purple-600"><Clock className="h-6 w-6" /></div>
            <div><p className="text-sm font-medium text-slate-500">Pending Review</p><h3 className="text-2xl font-bold text-slate-800">{stats.pending}</h3></div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-green-100">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="bg-green-100 p-3 rounded-full text-green-600"><CheckCircle className="h-6 w-6" /></div>
            <div><p className="text-sm font-medium text-slate-500">Approved Today</p><h3 className="text-2xl font-bold text-slate-800">{stats.approvedToday}</h3></div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-red-100">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="bg-red-100 p-3 rounded-full text-red-600"><XCircle className="h-6 w-6" /></div>
            <div><p className="text-sm font-medium text-slate-500">Total Rejected</p><h3 className="text-2xl font-bold text-slate-800">{stats.rejected}</h3></div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4">
          <div>
            <CardTitle className="text-xl text-purple-900">Marksheet Verification Queue</CardTitle>
            <CardDescription>Review student educational documents</CardDescription>
          </div>
          <div className="relative w-full md:w-64 mt-4 md:mt-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input placeholder="Search student or ID..." className="pl-9 bg-slate-50" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-12 text-slate-500"><CheckCircle className="h-12 w-12 mx-auto mb-3 text-slate-300" /><p>No pending documents to review</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Submitted Date</TableHead>
                    <TableHead>Expiry Set</TableHead>
                    <TableHead>Document</TableHead>
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
                      <TableCell>{new Date(doc.submitted_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {doc.expiry_date
                          ? <span className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5"><CalendarDays className="h-3 w-3" />{new Date(doc.expiry_date).toLocaleDateString()}</span>
                          : <span className="text-xs text-slate-400">—</span>}
                      </TableCell>
                      <TableCell>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="text-blue-600"><FileText className="h-4 w-4 mr-2" />View File<ExternalLink className="h-3 w-3 ml-1" /></Button>
                        </a>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {doc.status === 'pending' ? (
                          <>
                            <Button variant="outline" size="sm" className="bg-red-50 text-red-600 hover:bg-red-100 border-red-200" onClick={() => handleAction(doc.id, 'rejected', doc.user_id)} disabled={actionLoading === doc.id}>Reject</Button>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleAction(doc.id, 'approved', doc.user_id)} disabled={actionLoading === doc.id}>
                              {actionLoading === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
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
