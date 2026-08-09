import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface AuthFormProps {
  role: 'user' | 'principal' | 'banker' | 'it_officer' | 'medical_officer' | 'government_official';
  roleName: string;
  roleColor: string;
  roleIcon: React.ReactNode;
  sector?: string;
}

export const AuthForm: React.FC<AuthFormProps> = ({ role, roleName, roleColor, roleIcon, sector }) => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [organization, setOrganization] = useState('');

  const getDashboardRoute = (r: string) => {
    return `/dashboard/${r.replace('_officer', '').replace('_official', '')}`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (authData.user) {
        // Fetch profile to verify role
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (profileError) throw profileError;

        if (profile.role !== role) {
          // Wrong portal
          await supabase.auth.signOut();
          toast.error(`Access Denied`, {
            description: `This portal is for ${roleName}s only. Your account role is ${profile.role.replace('_', ' ')}.`
          });
          return;
        }

        toast.success('Login Successful', { description: `Welcome back, ${profile.full_name}` });
        navigate(getDashboardRoute(role));
      }
    } catch (error: any) {
      toast.error('Login Failed', { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 1. Sign up user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + '/portal',
          data: {
            full_name: fullName,
            role: role
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        // 2. Insert into profiles table
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            full_name: fullName,
            email: email,
            role: role,
            sector: sector || null,
            employee_id: employeeId || null,
            organization: organization || null,
            is_approved: role === 'user' ? true : false // Users auto-approved, others pending
          });

        if (profileError) {
          // Note: If RLS prevents insert from client, this will fail and we'll catch it here.
          // The prompt says "call supabase.auth.signUp() then insert into profiles table".
          throw profileError;
        }

        toast.success('Registration Successful', { 
          description: role === 'user' 
            ? 'Your account has been created successfully.' 
            : 'Your account is pending administrator approval.' 
        });

        if (role === 'user') {
          navigate(getDashboardRoute(role));
        } else {
          // Need to wait for approval
          await supabase.auth.signOut();
          navigate('/portal');
        }
      }
    } catch (error: any) {
      toast.error('Registration Failed', { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const colorStyles: Record<string, string> = {
    blue: 'from-blue-600 to-indigo-600 text-blue-600',
    purple: 'from-purple-600 to-fuchsia-600 text-purple-600',
    green: 'from-emerald-600 to-teal-600 text-emerald-600',
    cyan: 'from-cyan-600 to-blue-500 text-cyan-600',
    red: 'from-red-600 to-rose-600 text-red-600',
    amber: 'from-amber-500 to-orange-600 text-amber-600',
  };

  const bgGradient = colorStyles[roleColor] || colorStyles.blue;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 bg-opacity-95 p-4 relative overflow-hidden">
      {/* Background decorations matching existing project style */}
      <div className={`absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br ${bgGradient.split(' ')[0]} rounded-full blur-3xl opacity-20 -z-10`} />
      <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-tl ${bgGradient.split(' ')[1]} rounded-full blur-3xl opacity-20 -z-10`} />
      
      <Button 
        variant="ghost" 
        className="absolute top-6 left-6 text-slate-300 hover:text-white hover:bg-slate-800"
        onClick={() => navigate('/portal')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Portals
      </Button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl text-slate-100">
          <CardHeader className="text-center pb-6">
            <div className={`mx-auto p-4 rounded-2xl bg-gradient-to-br ${bgGradient.split(' ')[0]} ${bgGradient.split(' ')[1]} w-fit mb-4 shadow-lg`}>
              {React.cloneElement(roleIcon as React.ReactElement, { className: 'h-8 w-8 text-white' })}
            </div>
            <CardTitle className="text-3xl font-bold">{roleName} Portal</CardTitle>
            <CardDescription className="text-slate-400">
              Sign in or create an account to access the {roleName} dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-800 text-slate-400">
                <TabsTrigger value="login" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">Login</TabsTrigger>
                <TabsTrigger value="register" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">Register</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input 
                      id="login-email" 
                      type="email" 
                      required 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="Enter your email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input 
                      id="login-password" 
                      type="password" 
                      required 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="Enter your password"
                    />
                  </div>
                  <Button type="submit" className={`w-full bg-gradient-to-r ${bgGradient.split(' ')[0]} ${bgGradient.split(' ')[1]} hover:opacity-90 text-white`} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Sign In
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-name">Full Name</Label>
                    <Input 
                      id="reg-name" 
                      required 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input 
                      id="reg-email" 
                      type="email" 
                      required 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="Enter your email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input 
                      id="reg-password" 
                      type="password" 
                      required 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="Create a password"
                    />
                  </div>
                  
                  {role !== 'user' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="reg-emp-id">Employee ID</Label>
                        <Input 
                          id="reg-emp-id" 
                          required 
                          value={employeeId}
                          onChange={(e) => setEmployeeId(e.target.value)}
                          className="bg-slate-800 border-slate-700 text-white"
                          placeholder="Enter your employee ID"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-org">Organization / Institution</Label>
                        <Input 
                          id="reg-org" 
                          required 
                          value={organization}
                          onChange={(e) => setOrganization(e.target.value)}
                          className="bg-slate-800 border-slate-700 text-white"
                          placeholder="Enter your organization name"
                        />
                      </div>
                    </>
                  )}

                  <Button type="submit" className={`w-full bg-gradient-to-r ${bgGradient.split(' ')[0]} ${bgGradient.split(' ')[1]} hover:opacity-90 text-white`} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Register Account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
