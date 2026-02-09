import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Smartphone, Monitor, TrendingUp, Users, Target, Search } from 'lucide-react';

interface TrafficSession {
  id: string;
  traffic_type: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device_type: string | null;
  referrer: string | null;
  created_at: string;
}

const trafficIcons: Record<string, any> = {
  organic: Search,
  paid: Target,
  social: Users,
  direct: Globe,
  referral: TrendingUp,
  email: Globe,
  campaign: Target,
};

const trafficLabels: Record<string, string> = {
  organic: 'Orgânico',
  paid: 'Pago',
  social: 'Social',
  direct: 'Direto',
  referral: 'Referência',
  email: 'Email',
  campaign: 'Campanha',
};

const trafficColors: Record<string, string> = {
  organic: 'bg-green-100 text-green-800',
  paid: 'bg-blue-100 text-blue-800',
  social: 'bg-purple-100 text-purple-800',
  direct: 'bg-gray-100 text-gray-800',
  referral: 'bg-orange-100 text-orange-800',
  email: 'bg-yellow-100 text-yellow-800',
  campaign: 'bg-cyan-100 text-cyan-800',
};

export default function TrafficDashboard() {
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['traffic-sessions'],
    queryFn: async () => {
      // Get admin user IDs to exclude from traffic
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      
      const adminIds = (adminRoles || []).map(r => r.user_id);

      let query = supabase
        .from('traffic_sessions' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      // Exclude admin sessions
      if (adminIds.length > 0) {
        // Filter out sessions from admin users
        for (const id of adminIds) {
          query = query.neq('user_id', id);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as TrafficSession[];
    },
  });

  const total = sessions?.length || 0;

  // Group by traffic type
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byDevice: Record<string, number> = {};
  
  (sessions || []).forEach(s => {
    byType[s.traffic_type || 'direct'] = (byType[s.traffic_type || 'direct'] || 0) + 1;
    if (s.utm_source) bySource[s.utm_source] = (bySource[s.utm_source] || 0) + 1;
    byDevice[s.device_type || 'desktop'] = (byDevice[s.device_type || 'desktop'] || 0) + 1;
  });

  const sortedTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const sortedSources = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe className="h-6 w-6" />
          Tráfego & UTM
        </h1>
        <p className="text-muted-foreground">Acompanhe a origem do tráfego do seu site</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total de Sessões</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Desktop</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-muted-foreground" />
                  <p className="text-3xl font-bold">{byDevice['desktop'] || 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Mobile</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-muted-foreground" />
                  <p className="text-3xl font-bold">{byDevice['mobile'] || 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Fontes Únicas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{Object.keys(bySource).length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Traffic by type */}
          <Card>
            <CardHeader>
              <CardTitle>Por Tipo de Tráfego</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sortedTypes.map(([type, count]) => {
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  const Icon = trafficIcons[type] || Globe;
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <Badge className={trafficColors[type] || 'bg-gray-100 text-gray-800'}>
                        {trafficLabels[type] || type}
                      </Badge>
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium w-16 text-right">{count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Top sources */}
          {sortedSources.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Principais Fontes (UTM Source)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sortedSources.map(([source, count]) => (
                    <div key={source} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                      <span className="font-medium text-sm">{source}</span>
                      <Badge variant="outline">{count} sessões</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
