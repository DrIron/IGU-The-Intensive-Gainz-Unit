import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, Activity } from "lucide-react";

interface CoachNutritionGraphsProps {
  phase: any;
}

export function CoachNutritionGraphs({ phase }: CoachNutritionGraphsProps) {
  const [loading, setLoading] = useState(true);
  const [weightData, setWeightData] = useState<any[]>([]);
  const [weeklyAverages, setWeeklyAverages] = useState<any[]>([]);
  const [circumferenceData, setCircumferenceData] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);

  useEffect(() => {
    if (phase) {
      loadGraphData();
    }
  }, [phase]);

  const loadGraphData = async () => {
    try {
      setLoading(true);

      // Fetch all data
      const [weightsRes, circumRes, adjustmentsRes] = await Promise.all([
        supabase.from('weight_logs').select('*').eq('phase_id', phase.id).order('log_date', { ascending: true }),
        supabase.from('circumference_logs').select('*').eq('phase_id', phase.id).order('log_date', { ascending: true }),
        supabase.from('nutrition_adjustments').select('*').eq('phase_id', phase.id).eq('status', 'approved').order('week_number', { ascending: true })
      ]);

      const weights = weightsRes.data || [];
      const circum = circumRes.data || [];
      const adjs = adjustmentsRes.data || [];

      // Process weight data for daily chart
      const processedWeights = weights.map(log => ({
        date: new Date(log.log_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        weight: parseFloat(String(log.weight_kg)),
        weekNumber: log.week_number
      }));

      // Calculate weekly averages
      const weekMap = new Map<number, number[]>();
      weights.forEach(log => {
        const week = log.week_number;
        if (!weekMap.has(week)) {
          weekMap.set(week, []);
        }
        weekMap.get(week)!.push(parseFloat(String(log.weight_kg)));
      });

      const weeklyAvgs = Array.from(weekMap.entries())
        .map(([week, weights]) => ({
          week: `Week ${week}`,
          weekNumber: week,
          average: weights.reduce((sum, w) => sum + w, 0) / weights.length,
          count: weights.length
        }))
        .sort((a, b) => a.weekNumber - b.weekNumber);

      // Process circumference data
      const processedCircum = circum.map(log => ({
        week: `Week ${log.week_number}`,
        weekNumber: log.week_number,
        waist: log.waist_cm ? parseFloat(String(log.waist_cm)) : null,
        chest: log.chest_cm ? parseFloat(String(log.chest_cm)) : null,
        hips: log.hips_cm ? parseFloat(String(log.hips_cm)) : null,
        thighs: log.thighs_cm ? parseFloat(String(log.thighs_cm)) : null
      }));

      setWeightData(processedWeights);
      setWeeklyAverages(weeklyAvgs);
      setCircumferenceData(processedCircum);
      setAdjustments(adjs);
    } catch (error: any) {
      console.error('Error loading graph data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalChange = () => {
    if (weeklyAverages.length < 2) return null;
    const first = weeklyAverages[0].average;
    const last = weeklyAverages[weeklyAverages.length - 1].average;
    const change = last - first;
    const changePercent = (change / first) * 100;
    return { change, changePercent };
  };

  const totalChange = calculateTotalChange();

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading graphs...</p>
        </CardContent>
      </Card>
    );
  }

  if (weightData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Data Available</CardTitle>
          <CardDescription>
            No measurements available for your coaching period. Client data from before your assignment is not visible.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Weigh-Ins</CardDescription>
            <CardTitle className="text-3xl">{weightData.length}</CardTitle>
          </CardHeader>
        </Card>

        {totalChange && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Total Weight Change</CardDescription>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-3xl">
                    {totalChange.change > 0 ? '+' : ''}{totalChange.change.toFixed(1)} kg
                  </CardTitle>
                  {totalChange.change < 0 ? (
                    <TrendingDown className="h-6 w-6 text-green-500" />
                  ) : (
                    <TrendingUp className="h-6 w-6 text-blue-500" />
                  )}
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Percentage Change</CardDescription>
                <CardTitle className="text-3xl">
                  {totalChange.changePercent > 0 ? '+' : ''}{totalChange.changePercent.toFixed(1)}%
                </CardTitle>
              </CardHeader>
            </Card>
          </>
        )}
      </div>

      {/* Graph Tabs */}
      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="daily">Daily Weight</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Averages</TabsTrigger>
          <TabsTrigger value="measurements">Body Measurements</TabsTrigger>
        </TabsList>

        {/* Daily Weight Chart */}
        <TabsContent value="daily" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Weight Trend</CardTitle>
              <CardDescription>All weigh-ins over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={weightData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    domain={['dataMin - 2', 'dataMax + 2']}
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="weight" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  {phase.starting_weight_kg && (
                    <ReferenceLine 
                      y={parseFloat(phase.starting_weight_kg)} 
                      stroke="hsl(var(--muted-foreground))" 
                      strokeDasharray="3 3"
                      label={{ value: 'Starting', position: 'right', fill: 'hsl(var(--muted-foreground))' }}
                    />
                  )}
                  {phase.target_weight_kg && (
                    <ReferenceLine 
                      y={parseFloat(phase.target_weight_kg)} 
                      stroke="hsl(var(--primary))" 
                      strokeDasharray="5 5"
                      label={{ value: 'Target', position: 'right', fill: 'hsl(var(--primary))' }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Weekly Averages Chart */}
        <TabsContent value="weekly" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Average Weight</CardTitle>
              <CardDescription>Average weight per week with adjustment indicators</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={weeklyAverages}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="week" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    domain={['dataMin - 2', 'dataMax + 2']}
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    label={{ value: 'Avg Weight (kg)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: any) => [`${value.toFixed(2)} kg`, 'Average']}
                  />
                  <Bar 
                    dataKey="average" 
                    fill="hsl(var(--primary))"
                    radius={[8, 8, 0, 0]}
                  />
                  {phase.starting_weight_kg && (
                    <ReferenceLine 
                      y={parseFloat(phase.starting_weight_kg)} 
                      stroke="hsl(var(--muted-foreground))" 
                      strokeDasharray="3 3"
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>

              {/* Adjustments Timeline */}
              {adjustments.length > 0 && (
                <div className="pt-4 border-t space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium">Calorie Adjustments Applied</p>
                  </div>
                  <div className="space-y-2">
                    {adjustments.map((adj) => (
                      <div key={adj.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="text-sm font-medium">Week {adj.week_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {adj.approved_calorie_adjustment > 0 ? '+' : ''}{adj.approved_calorie_adjustment} kcal
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {Math.round(adj.new_daily_calories)} kcal total
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Body Measurements Chart */}
        <TabsContent value="measurements" className="space-y-4">
          {circumferenceData.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Body Circumference Trends</CardTitle>
                <CardDescription>Track changes in body measurements over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={circumferenceData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="week" 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      label={{ value: 'Circumference (cm)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    {circumferenceData.some(d => d.waist) && (
                      <Line 
                        type="monotone" 
                        dataKey="waist" 
                        stroke="#ef4444" 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        name="Waist"
                      />
                    )}
                    {circumferenceData.some(d => d.chest) && (
                      <Line 
                        type="monotone" 
                        dataKey="chest" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        name="Chest"
                      />
                    )}
                    {circumferenceData.some(d => d.hips) && (
                      <Line 
                        type="monotone" 
                        dataKey="hips" 
                        stroke="#8b5cf6" 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        name="Hips"
                      />
                    )}
                    {circumferenceData.some(d => d.thighs) && (
                      <Line 
                        type="monotone" 
                        dataKey="thighs" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        name="Thighs"
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No Measurement Data</CardTitle>
                <CardDescription>Client hasn't logged any body measurements yet</CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
