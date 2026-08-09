import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { DashboardLayout } from '../components/DashboardLayout';
import { IssueVCDialog } from '../components/IssueVCDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Activity, Link2, ShieldAlert, CheckCircle, Search, Database, CalendarDays, Fingerprint } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export default function ITDashboard() {
  const { user, role } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState({ totalDocs: 0, pendingCount: 0, blockCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [vcDialogDoc, setVcDialogDoc] = useState<any | null>(null);
  const [vcIssuing, setVcIssuing] = useState(false);

  const fetchData = async () => {
    try {
      // 1. Fetch all documents (read-only view)
      const { data: docs, error: docsError } = await supabase
        .from('kyc_documents')
        .select(`*, profiles:user_id (full_name, email)`)
        .order('submitted_at', { ascending: false })
        .limit(100);
      
      if (docsError) throw docsError;
      setDocuments(docs || []);

      // 2. Fetch full audit log
      const { data: logs, error: logsError } = await supabase
        .from('audit_logs')
        .select(`*, profiles:performed_by (full_name, role)`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (logsError) throw logsError;
      setAuditLogs(logs || []);

      // 3. Fetch system health / blockchain blocks
      const bcRes = await fetch('/api/blockchain/explorer?limit=1');
      let blockCount = 0;
      if (bcRes.ok) {
        const bcData = await bcRes.json();
        blockCount = bcData.total || 0;
      }

      setSystemHealth({
        totalDocs: docs?.length || 0,
        pendingCount: docs?.filter(d => d.status === 'pending').length || 0,
        blockCount
      });

    } catch (error: any) {
      toast.error('Error fetching data', { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const handleFlagDocument = async (docId: string, targetUserId: string) => {
    if (!user) return;
    setActionLoading(docId);
    
    try {
      const reason = prompt('Enter reason for flagging this document:');
      if (!reason) {
        setActionLoading(null);
        return;
      }

      const { error: updateError } = await supabase
        .from('kyc_documents')
        .update({ status: 'flagged', remarks: reason })
        .eq('id', docId);

      if (updateError) throw updateError;

      await supabase.from('audit_logs').insert({
        action: 'DOCUMENT_FLAGGED',
        performed_by: user.id,
        target_user: targetUserId,
        document_id: docId,
        metadata: { reason, flagged_by: 'IT_OFFICER' }
      });

      toast.success('Document flagged for security review');
      fetchData();
    } catch (error: any) {
      toast.error('Flag failed', { description: error.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleIssueVC = async (docId: string, targetUserId: string, expiryDate: string) => {
    if (!user) return;
    setVcIssuing(true);
    try {
      const expiry = new Date(expiryDate);
      const expiryDays = Math.max(1, Math.ceil((expiry.getTime() - Date.now()) / 86400000));

      const response = await fetch('/api/did/vc/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': role || '' },
        body: JSON.stringify({ 
          holderUserId: targetUserId, 
          credentialType: 'SecurityClearanceCredential', 
          claims: { docId, status: 'Verified', clearance: 'IT Security Approved', expiryDate }, 
          expiryDays 
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      await supabase.from('kyc_documents').update({ expiry_date: expiryDate }).eq('id', docId);
      await supabase.from('audit_logs').insert({ 
        action: 'IT_VC_ISSUED', 
        performed_by: user.id, 
        target_user: targetUserId, 
        document_id: docId, 
        metadata: { expiry_date: expiryDate, vc_id: data.vc?.id } 
      });

      toast.success(`Security VC issued! Expires ${new Date(expiryDate).toLocaleDateString()}`);
      setVcDialogDoc(null);
      fetchData();
    } catch (err: any) {
      toast.error('Failed to issue VC', { description: err.message });
    } finally {
      setVcIssuing(false);
    }
  };

  const handleVerifyHash = async (hash: string) => {
    if (!hash) return;
    try {
      const response = await fetch(`/api/blockchain/verify/${hash}`);
      const result = await response.json();
      if (result.success) {
        toast.success('Blockchain Integrity Verified', { description: 'The hash exists and is valid on the chain.' });
      } else {
        toast.error('Verification Failed', { description: 'Hash is invalid or not found on the blockchain.' });
      }
    } catch (e) {
      toast.error('Network Error', { description: 'Could not contact blockchain node.' });
    }
  };

  const filteredDocs = documents.filter(doc => 
    doc.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    doc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.blockchain_tx_hash?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout title="IT Security Portal">
      {vcDialogDoc && (
        <IssueVCDialog
          doc={vcDialogDoc}
          credentialType="Security Clearance"
          authorityLabel="IT Security Dept"
          accentColor="indigo"
          defaultExpiryYears={2}
          onClose={() => setVcDialogDoc(null)}
          onIssue={handleIssueVC}
          isLoading={vcIssuing}
        />
      )}

      {/* System Health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="shadow-sm border-cyan-100">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="bg-cyan-100 p-3 rounded-full text-cyan-600"><Database className="h-6 w-6" /></div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Documents</p>
              <h3 className="text-2xl font-bold text-slate-800">{systemHealth.totalDocs}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-amber-100">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="bg-amber-100 p-3 rounded-full text-amber-600"><Activity className="h-6 w-6" /></div>
            <div>
              <p className="text-sm font-medium text-slate-500">Pending Verification</p>
              <h3 className="text-2xl font-bold text-slate-800">{systemHealth.pendingCount}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-blue-100">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="bg-blue-100 p-3 rounded-full text-blue-600"><Link2 className="h-6 w-6" /></div>
            <div>
              <p className="text-sm font-medium text-slate-500">Blockchain Blocks</p>
              <h3 className="text-2xl font-bold text-slate-800">{systemHealth.blockCount}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document Master View */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4">
            <div>
              <CardTitle className="text-xl">Master Document Ledger</CardTitle>
              <CardDescription>Security oversight of all system documents</CardDescription>
            </div>
            <div className="relative w-full md:w-64 mt-4 md:mt-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input 
                placeholder="Search hash or user..." 
                className="pl-9 bg-slate-50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-cyan-600" /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User / Type</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Blockchain TX</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocs.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="font-medium text-slate-900">{doc.profiles?.full_name}</div>
                          <div className="text-xs text-slate-500 capitalize">{doc.doc_type.replace('_', ' ')}</div>
                        </TableCell>
                        <TableCell>
                          {doc.expiry_date ? (
                            <span className="inline-flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
                              <CalendarDays className="h-3 w-3" />
                              {new Date(doc.expiry_date).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {doc.blockchain_tx_hash ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono bg-slate-100 p-1 rounded text-slate-600 max-w-[100px] truncate">
                                {doc.blockchain_tx_hash}
                              </span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleVerifyHash(doc.blockchain_tx_hash)}>
                                <CheckCircle className="h-3 w-3 text-cyan-600" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Off-chain</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={doc.status === 'flagged' ? 'destructive' : 'outline'}>
                            {doc.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          {doc.status === 'approved' && (
                            <Button 
                              size="sm" 
                              className="bg-indigo-600 hover:bg-indigo-700 text-white" 
                              onClick={() => setVcDialogDoc(doc)}
                            >
                              <Fingerprint className="h-3 w-3 mr-1" /> VC
                            </Button>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200"
                            onClick={() => handleFlagDocument(doc.id, doc.user_id)}
                            disabled={actionLoading === doc.id || doc.status === 'flagged'}
                          >
                            {actionLoading === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldAlert className="h-3 w-3 mr-1"/> Flag</>}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Audit Log */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">System Audit</CardTitle>
            <CardDescription>Global activity monitor</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[600px] overflow-y-auto">
            {isLoading ? (
               <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-cyan-600" /></div>
            ) : (
               <div className="space-y-4">
                 {auditLogs.map((log) => (
                   <div key={log.id} className="flex flex-col pb-3 border-b border-slate-100 last:border-0">
                     <span className="text-xs text-slate-400">{new Date(log.created_at).toLocaleString()}</span>
                     <span className="text-sm font-medium text-slate-800">{log.action}</span>
                     <span className="text-xs text-slate-500">By: {log.profiles?.full_name || 'System'} ({log.profiles?.role})</span>
                   </div>
                 ))}
               </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
