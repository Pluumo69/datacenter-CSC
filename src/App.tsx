import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ComposedChart,
  Line,
  AreaChart,
  Area,
  LabelList,
  Cell,
  LineChart
} from 'recharts';
import { Upload, Battery, AlertTriangle, Calendar, Activity, TrendingDown, TrendingUp, ZapOff, AlertOctagon, List, Settings, BarChart3, Fuel, Coins, Percent, Zap, Printer, Sun, Info, Trash2, Clock, Truck, Scale, Banknote, PieChart as PieIcon, FileText, Zap as ZapIcon, RefreshCw, Download } from 'lucide-react';

// --- TYPES ---
type DataPoint = {
  datetime: Date;
  limitMW: number;
};

type SolarPoint = {
  datetime: Date;
  generationMW: number;
};

type SimulationStep = {
  datetime: Date;
  gridLimit: number;
  dcDemand: number;
  logisticsDemand: number; 
  totalDemand: number;      
  solarGeneration: number; 
  solarUsedByLoad: number; 
  gridToLoad: number;      
  batToLoad: number;        
  gridToBat: number;
  solarToBat: number;        
  shortage: number;
  socEnd: number;
  isBatteryActive: boolean; 
};

type RestrictionEvent = {
  start: Date;
  end: Date;
  durationHours: number;
  totalDeficitMWh: number; 
  totalGridRestrictedMWh: number;
  mitigated: boolean;
  batteryStartSoC: number;
};

type OutageEvent = {
  start: Date;
  end: Date;
  durationHours: number;
  totalMissedMWh: number;
  maxShortageMW: number;
};

type DistributionBucket = {
  duration: number;
  frequency: number;
  avgMWhCurtailed: number;
  totalMWhCurtailed: number;
};

type MonthlyStat = {
  month: string;
  restrictedMWh: number;
  restrictedHours: number;
  solarGeneration: number; 
  solarUsed: number;
  deficitMitigatedBySolar: number;
  deficitMitigatedByBat: number;
  deficitNet: number;
};

type YearlyResult = {
  year: number;
  dcDeficitWithBat: number;
  totalHoursRestricted: number;
  totalMWhRestricted: number; 
  cscPercentage: number;        
  grossDieselCost: number; 
  avoidedGridCost: number;
  netExtraCost: number; 
  solarSelfConsumption: number; 
  totalSolarGeneration: number; 
  totalLoadConsumption: number; 
  deficitAfterSolar: number;
  restrictedVolumeLoad: number; 
  dieselPercentage: number;
  dieselLiters: number; // Added for new chart
  tradingVolumePotentialMWh: number; 
  tradingVolumePercent: number;
  // Mix data for table
  totalGridToLoad: number;
  totalSolarToLoad: number;
  totalBatToLoad: number;
  // Capacity Trend Data (MW)
  capLogisticsMW: number;
  capDcActualMW: number;
  capDcContractMW: number;
  capBatterySpaceMW: number;
};

type CapacitySensitivityResult = {
    capacityMW: number;
    netExtraCost: number;
    deficitMWh: number;
    tradingHours: number; 
    tradingVolume: number; 
};

type AnalysisResult = {
  totalHoursRestricted: number;
  totalMWhRestrictedGrid: number;
  curtailmentPercentageVolume: number;
  loadDeficitMWhNoBat: number; 
  loadDeficitMWhWithBat: number;
  totalSolarGeneration: number; 
  totalSolarUsed: number;        
  totalLoadConsumption: number; 
  deficitAfterSolar: number;
  restrictedVolumeLoad: number;
  totalGridToLoad: number;
  totalSolarToLoad: number;
  totalBatToLoad: number;
  events: RestrictionEvent[];
  outageEvents: OutageEvent[]; 
  distribution: DistributionBucket[];
  monthlyStats: MonthlyStat[];
  simulationSteps: SimulationStep[];
  worstWeekData: SimulationStep[];
  batteryAutonomyHours: number;
  tradingHoursAvailable: number; 
  tradingVolumePotentialMWh: number;
};

// --- CUSTOM LABEL COMPONENT ---
const CustomizedLabel = (props: any) => {
  const { x, y, width, height, value, index, total } = props;
  
  if (value === null || value === undefined || value === 0 || typeof value === 'object') return null;

  const startX = x + width;
  const startY = y + height / 2;
  const staggerOffset = (index || 0) * 35; 
  const endX = startX + 30 + staggerOffset; 
  const endY = startY;
  const textX = endX + 5;
  const textY = endY;

  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';

  return (
    <g>
      <line 
        x1={startX} 
        y1={startY} 
        x2={endX} 
        y2={endY} 
        stroke="#64748b" 
        strokeWidth={1} 
        strokeDasharray="2 2"
      />
      <circle cx={startX} cy={startY} r={2} fill="#64748b" />
      <text 
        x={textX} 
        y={textY} 
        dy={4} 
        fontSize="10" 
        fontWeight="bold" 
        fill="#334155"
        textAnchor="start"
      >
        {props.formatter ? props.formatter(value) : value} ({percentage}%)
      </text>
    </g>
  );
};

// --- HELPER: DATA GENERATION ---
const getYearDataOrFallback = (targetYear: number, sourceData: DataPoint[]) => {
    // 1. Try to find actual data for this year
    const specificYearData = sourceData.filter(d => d.datetime.getFullYear() === targetYear);
    
    // If we have substantial data (e.g. > 24 hours), use it
    if (specificYearData.length > 24) { 
        return specificYearData;
    }
    
    // 2. If no data (e.g. uploaded CSV stops at 2030), generate a "Clean" 10MW profile for the whole year
    // This solves the issue where 2036 appears empty if the CSV doesn't go that far
    const data: DataPoint[] = [];
    const start = new Date(targetYear, 0, 1, 0, 0, 0);
    const end = new Date(targetYear, 11, 31, 23, 0, 0);
    
    for (let d = new Date(start); d <= end; d.setHours(d.getHours() + 1)) {
        data.push({
            datetime: new Date(d),
            limitMW: 10 // Default to max connection (no congestion)
        });
    }
    return data;
};

// --- HELPER: SIMULATION LOGIC ---
const runSimulation = (
  yearData: DataPoint[], 
  solarData: SolarPoint[], 
  dcCapacityMW: number, 
  batteryCapacityMWh: number,
  batteryPowerMW: number,
  dcUtilizationFactor: number,
  logisticsMW: number,
  logisticsStartHour: number,
  logisticsEndHour: number,
  solarScaleFactor: number,
  cscEndDate: Date
): AnalysisResult => {
  if (yearData.length === 0) {
      // Should ideally be caught by getYearDataOrFallback, but as safety:
      const hoursInYear = 8760;
      const totalTradingPotential = hoursInYear * batteryPowerMW;
      
      return {
        totalHoursRestricted: 0,
        totalMWhRestrictedGrid: 0,
        curtailmentPercentageVolume: 0,
        loadDeficitMWhNoBat: 0,
        loadDeficitMWhWithBat: 0,
        totalSolarGeneration: 0,
        totalSolarUsed: 0,
        totalLoadConsumption: 0,
        deficitAfterSolar: 0,
        restrictedVolumeLoad: 0,
        totalGridToLoad: 0,
        totalSolarToLoad: 0,
        totalBatToLoad: 0,
        events: [],
        outageEvents: [],
        distribution: [],
        monthlyStats: [],
        simulationSteps: [],
        worstWeekData: [],
        batteryAutonomyHours: 0,
        tradingHoursAvailable: hoursInYear,
        tradingVolumePotentialMWh: totalTradingPotential 
      };
  }

  yearData.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  // Sort solar data if exists
  if(solarData.length > 0) solarData.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());

  // Optimize solar lookup
  const solarMap = new Map<string, number>();
  // Helper to normalize date string for map key (Month-Day-Hour) to handle different years
  const getKey = (d: Date) => `${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
  
  solarData.forEach(s => solarMap.set(getKey(s.datetime), s.generationMW));

  let currentSoC = batteryCapacityMWh;
  const maxChargeRate = batteryPowerMW;
  const maxDischargeRate = batteryPowerMW;
  const connectionMax = 10;
  const cscEndTime = cscEndDate.getTime();
  
  const effectiveDcDemandMW = dcCapacityMW * (dcUtilizationFactor / 100);
  
  const logisticsHoursPerDay = Math.max(0, logisticsEndHour - logisticsStartHour);
  const avgLogisticsMW = (logisticsMW * logisticsHoursPerDay) / 24;
  const totalAvgDemandMW = effectiveDcDemandMW + avgLogisticsMW;
  
  const batteryAutonomyHours = totalAvgDemandMW > 0 ? batteryCapacityMWh / totalAvgDemandMW : 999;

  let totalHoursRestricted = 0;
  let totalMWhRestrictedGrid = 0;
  let loadDeficitMWhNoBat = 0;
  let loadDeficitMWhWithBat = 0;
  let totalSolarGeneration = 0;
  let totalSolarUsed = 0;
  let totalLoadConsumption = 0;
  let deficitAfterSolarTotal = 0;
  let restrictedVolumeLoadTotal = 0;
  let totalGridToLoad = 0;
  let totalSolarToLoad = 0;
  let totalBatToLoad = 0;
  let batteryBusyHours = 0; 
  let tradingVolumePotentialMWh = 0; 
  
  const steps: SimulationStep[] = [];

  const monthlyData: MonthlyStat[] = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(2000, i, 1).toLocaleString('nl-NL', { month: 'short' }),
    restrictedMWh: 0,
    restrictedHours: 0,
    solarGeneration: 0,
    solarUsed: 0,
    deficitMitigatedBySolar: 0,
    deficitMitigatedByBat: 0,
    deficitNet: 0
  }));

  for (let i = 0; i < yearData.length; i++) {
      const point = yearData[i];
      const monthIndex = point.datetime.getMonth();
      const hour = point.datetime.getHours();
      
      // Determine grid limit based on CSC profile or End Date
      let gridLimit = Math.max(0, point.limitMW);
      if (point.datetime.getTime() >= cscEndTime) {
          gridLimit = 10; // CSC restrictions lifted
      }

      const availableGrid = Math.min(gridLimit, connectionMax);
      
      // Get Solar Data (try direct year match, then fallback to month-day-hour match)
      let rawSolarGen = 0;
      const key = getKey(point.datetime);
      if (solarMap.has(key)) {
          rawSolarGen = solarMap.get(key) || 0;
      }
      
      const solarGen = rawSolarGen * solarScaleFactor;

      let logisticsDemand = 0;
      if (hour >= logisticsStartHour && hour < logisticsEndHour) {
          logisticsDemand = logisticsMW;
      }
      
      const totalDemand = effectiveDcDemandMW + logisticsDemand;
      totalLoadConsumption += totalDemand; 

      const theoreticalDeficitNoSolar = Math.max(0, totalDemand - availableGrid);

      const solarToLoad = Math.min(solarGen, totalDemand);
      const demandAfterSolar = totalDemand - solarToLoad;
      const gridToLoad = Math.min(availableGrid, demandAfterSolar);
      const shortagePreBat = demandAfterSolar - gridToLoad; 

      const deficitMitigatedBySolar = Math.max(0, theoreticalDeficitNoSolar - shortagePreBat);

      loadDeficitMWhNoBat += shortagePreBat;
      deficitAfterSolarTotal += shortagePreBat;
      totalGridToLoad += gridToLoad;
      totalSolarToLoad += solarToLoad;

      if (gridLimit < 9.99) {
          const restrictedAmount = (10 - gridLimit);
          totalHoursRestricted++;
          totalMWhRestrictedGrid += restrictedAmount;
          monthlyData[monthIndex].restrictedHours += 1;
          monthlyData[monthIndex].restrictedMWh += restrictedAmount;
          
          restrictedVolumeLoadTotal += theoreticalDeficitNoSolar;
      }

      let batToLoad = 0;
      let gridToBat = 0;
      let solarToBat = 0;
      let finalShortage = 0;
      let isBatteryActive = false;

      // 3. Battery Logic
      if (shortagePreBat > 0) {
          const dischargePotential = Math.min(shortagePreBat, currentSoC, maxDischargeRate);
          batToLoad = dischargePotential;
          currentSoC -= dischargePotential;
          finalShortage = shortagePreBat - dischargePotential;
          if (batToLoad > 0) isBatteryActive = true;
      } else {
          const solarSurplus = solarGen - solarToLoad;
          const gridSurplus = availableGrid - gridToLoad;
          const spaceInBat = batteryCapacityMWh - currentSoC;
          
          if (spaceInBat > 0) {
              const chargeFromSolar = Math.min(solarSurplus, spaceInBat, maxChargeRate);
              solarToBat = chargeFromSolar;
              
              const remainingChargeCap = Math.min(spaceInBat - solarToBat, maxChargeRate - solarToBat);
              const chargeFromGrid = Math.min(gridSurplus, remainingChargeCap);
              gridToBat = chargeFromGrid;
              
              currentSoC += (solarToBat + gridToBat);
              
              if (solarToBat > 0 || gridToBat > 0) isBatteryActive = true;
          }
      }
      
      const deficitMitigatedByBat = Math.max(0, shortagePreBat - finalShortage);

      monthlyData[monthIndex].deficitMitigatedBySolar += deficitMitigatedBySolar;
      monthlyData[monthIndex].deficitMitigatedByBat += deficitMitigatedByBat;
      monthlyData[monthIndex].deficitNet += finalShortage;

      totalBatToLoad += batToLoad;

      if (isBatteryActive) {
          batteryBusyHours++;
      } else {
          // Handelspotentieel = overgebleven ruimte op grid aansluiting
          const unusedGridCapacity = Math.max(0, gridLimit - gridToLoad);
          const tradingPotential = Math.min(batteryPowerMW, unusedGridCapacity);
          tradingVolumePotentialMWh += tradingPotential;
      }
      
      loadDeficitMWhWithBat += finalShortage;
      
      const usedSolarThisHour = solarToLoad + solarToBat;
      totalSolarGeneration += solarGen;
      totalSolarUsed += usedSolarThisHour;

      monthlyData[monthIndex].solarGeneration += solarGen;
      monthlyData[monthIndex].solarUsed += usedSolarThisHour;

      steps.push({
          datetime: point.datetime,
          gridLimit,
          dcDemand: effectiveDcDemandMW,
          logisticsDemand,
          totalDemand,
          solarGeneration: solarGen,
          solarUsedByLoad: solarToLoad,
          gridToLoad,
          batToLoad,
          gridToBat,
          solarToBat,
          shortage: finalShortage,
          socEnd: currentSoC,
          isBatteryActive
      });
  }

  const events: RestrictionEvent[] = [];
  let currentEvent: Partial<RestrictionEvent> | null = null;

  for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const isRestricted = s.gridLimit < 9.99;
      
      if (isRestricted) {
          const restrictedMWh = 10 - s.gridLimit;
          const deficitMWh = Math.max(0, (s.totalDemand - s.solarUsedByLoad) - s.gridToLoad); 

          if (!currentEvent) {
              currentEvent = {
                  start: s.datetime,
                  end: s.datetime,
                  durationHours: 1,
                  totalDeficitMWh: deficitMWh,
                  totalGridRestrictedMWh: restrictedMWh,
                  batteryStartSoC: i > 0 ? steps[i-1].socEnd : batteryCapacityMWh,
                  mitigated: true
              };
          } else {
              currentEvent.durationHours = (currentEvent.durationHours || 0) + 1;
              currentEvent.totalDeficitMWh = (currentEvent.totalDeficitMWh || 0) + deficitMWh;
              currentEvent.totalGridRestrictedMWh = (currentEvent.totalGridRestrictedMWh || 0) + restrictedMWh;
              currentEvent.end = s.datetime;
          }
          if (s.shortage > 0.001) {
              currentEvent.mitigated = false;
          }
      } else {
          if (currentEvent) {
              events.push(currentEvent as RestrictionEvent);
              currentEvent = null;
          }
      }
  }
  if (currentEvent) events.push(currentEvent as RestrictionEvent);

  const outageEvents: OutageEvent[] = [];
  let currentOutage: Partial<OutageEvent> | null = null;

  for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const hasShortage = s.shortage > 0.001; 
      
      if (hasShortage) {
          if (!currentOutage) {
              currentOutage = {
                  start: s.datetime,
                  end: s.datetime,
                  durationHours: 1,
                  totalMissedMWh: s.shortage,
                  maxShortageMW: s.shortage
              };
          } else {
              currentOutage.durationHours = (currentOutage.durationHours || 0) + 1;
              currentOutage.totalMissedMWh = (currentOutage.totalMissedMWh || 0) + s.shortage;
              currentOutage.maxShortageMW = Math.max(currentOutage.maxShortageMW || 0, s.shortage);
              currentOutage.end = s.datetime;
          }
      } else {
          if (currentOutage) {
              outageEvents.push(currentOutage as OutageEvent);
              currentOutage = null;
          }
      }
  }
  if (currentOutage) outageEvents.push(currentOutage as OutageEvent);

  const distMap = new Map<number, { count: number, totalDeficit: number }>();
  events.forEach(e => {
      const d = e.durationHours;
      const current = distMap.get(d) || { count: 0, totalDeficit: 0 };
      distMap.set(d, {
          count: current.count + 1,
          totalDeficit: current.totalDeficit + e.totalDeficitMWh 
      });
  });

  const distribution: DistributionBucket[] = Array.from(distMap.entries()).map(([duration, data]) => ({
      duration,
      frequency: data.count,
      totalMWhCurtailed: data.totalDeficit,
      avgMWhCurtailed: data.totalDeficit / data.count
  })).sort((a, b) => a.duration - b.duration);

  let minSoC = batteryCapacityMWh;
  let minIndex = 0;
  for(let i=0; i<steps.length; i++) {
      if(steps[i].socEnd < minSoC) {
          minSoC = steps[i].socEnd;
          minIndex = i;
      }
  }
  const startIndex = Math.max(0, minIndex - (24*3));
  const endIndex = Math.min(steps.length, minIndex + (24*4));
  const worstWeekData = steps.slice(startIndex, endIndex);

  const totalYearlyCapacityMWh = 10 * 8760;
  const volumePercentage = (totalMWhRestrictedGrid / totalYearlyCapacityMWh) * 100;
  
  const tradingHoursAvailable = Math.max(0, 8760 - batteryBusyHours);

  return {
    totalHoursRestricted,
    totalMWhRestrictedGrid,
    curtailmentPercentageVolume: volumePercentage,
    loadDeficitMWhNoBat,
    loadDeficitMWhWithBat,
    totalSolarGeneration,
    totalSolarUsed,
    totalLoadConsumption,
    deficitAfterSolar: deficitAfterSolarTotal,
    restrictedVolumeLoad: restrictedVolumeLoadTotal,
    totalGridToLoad,
    totalSolarToLoad,
    totalBatToLoad,
    events,
    outageEvents,
    distribution,
    monthlyStats: monthlyData,
    simulationSteps: steps,
    worstWeekData,
    batteryAutonomyHours,
    tradingHoursAvailable,
    tradingVolumePotentialMWh
  };
};

// --- MOCK DATA ---
const generateMockData = (): string => {
  const lines = ["datetime;profiel"];
  const startDate = new Date('2024-01-01T00:00:00'); // Changed start to 2024 to cover all years
  const endDate = new Date('2036-12-31T23:00:00'); 
  
  for (let d = new Date(startDate); d <= endDate; d.setHours(d.getHours() + 1)) {
    const dateStr = d.toISOString().replace('T', ' ').substring(0, 19);
    let val = 10;
    const yearMod = (d.getFullYear() - 2026) * 0.02;
    const month = d.getMonth();
    const isWinter = month < 2 || month > 9;
    if (Math.random() < ((isWinter ? 0.08 : 0.02) + yearMod)) {
        val = Math.max(0, 10 - (Math.random() * 8)); 
    }
    const valStr = val.toFixed(3).replace('.', ',');
    lines.push(`${dateStr};${valStr}`);
  }
  return lines.join("\n");
};

const App = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rawData, setRawData] = useState<DataPoint[]>([]);
  const [solarData, setSolarData] = useState<SolarPoint[]>([]); 
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);
  
  const [selectedYear, setSelectedYear] = useState<number>(2027);
  const [startYear, setStartYear] = useState<number>(2027); 
  const [cscEndDateStr, setCscEndDateStr] = useState<string>('2036-01-01'); 
  
  const [dcCapacityMW, setDcCapacityMW] = useState<number>(2);
  const [batteryCapacityMWh, setBatteryCapacityMWh] = useState<number>(40); 
  const [batteryPowerMW, setBatteryPowerMW] = useState<number>(10);
  const [dcUtilizationFactor, setDcUtilizationFactor] = useState<number>(65); 
  const [isUsingMockData, setIsUsingMockData] = useState<boolean>(true);
  const [isPrintPreview, setIsPrintPreview] = useState(false);
  
  // Growth Profile
  const [growthProfile, setGrowthProfile] = useState<number[]>([2, 4, 6, 7]);
  
  // Logistics
  const [logisticsMW, setLogisticsMW] = useState<number>(0.5);
  const [logisticsStartHour, setLogisticsStartHour] = useState<number>(6);
  const [logisticsEndHour, setLogisticsEndHour] = useState<number>(18);
  
  // Solar Scaling
  const [baseSolarMWp, setBaseSolarMWp] = useState<number>(4.0); 
  const [targetSolarMWp, setTargetSolarMWp] = useState<number>(4.0);
  const [showSolarWarning, setShowSolarWarning] = useState<boolean>(false);
  
  const [dieselKwhPerLiter, setDieselKwhPerLiter] = useState<number>(3.5);
  const [dieselPrice, setDieselPrice] = useState<number>(1.50);
  const [electricityPrice, setElectricityPrice] = useState<number>(100);

  const availableYears = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036]; 
  
  const dcGrowthSchedule: Record<number, number> = {
    2027: 2, 2028: 4, 2029: 6,
  };

  // --- AUTO LOAD LOGIC ---
  useEffect(() => {
    // FORCE RELOAD WITH NEW KEY _v7
    const storedGrid = localStorage.getItem('bess_grid_csv_v7');
    const storedSolar = localStorage.getItem('bess_solar_csv_v7');
    
    let loaded = false;
    
    if (storedGrid) {
        // Try to parse stored grid
        const lines = storedGrid.split(/\r?\n/);
        // Quick check if 2036 is present in data (very rough check)
        if (storedGrid.includes("2036-12")) {
             handleCSVContent(storedGrid, 'grid', false);
             setIsUsingMockData(false);
             loaded = true;
        } else {
             // Stored data is stale (doesn't contain 2036), regenerate
             console.log("Old data detected, regenerating mock data...");
             handleCSVContent(generateMockData(), 'grid', true); // Force save new data
             setIsUsingMockData(true);
             loaded = true;
        }
    } else {
        handleCSVContent(generateMockData(), 'grid', true); // Generate and save
        setIsUsingMockData(true);
        loaded = true;
    }

    if (storedSolar) {
        handleCSVContent(storedSolar, 'solar', false);
    }
    
    if (loaded) setHasLoadedFromStorage(true);
  }, []);

  // Update DC Capacity based on selected year relative to start year
  useEffect(() => {
    let newCap = 0;
    if (selectedYear < startYear) {
        newCap = 0;
    } else {
        const offset = selectedYear - startYear;
        if (offset === 0) newCap = growthProfile[0];
        else if (offset === 1) newCap = growthProfile[1];
        else if (offset === 2) newCap = growthProfile[2];
        else newCap = growthProfile[3];
    }
    setDcCapacityMW(newCap);
  }, [selectedYear, startYear, growthProfile]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, type: 'grid' | 'solar') => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      handleCSVContent(content, type, true); 
      if (type === 'grid') setIsUsingMockData(false);
    };
    event.target.value = '';
    reader.readAsText(file);
  };

  const handleHardReset = () => {
      // Clear all versions of keys to be safe
      Object.keys(localStorage).forEach(key => {
          if (key.startsWith('bess_')) localStorage.removeItem(key);
      });
      window.location.reload();
  };

  const handleClearStorage = () => {
      localStorage.removeItem('bess_grid_csv_v7');
      localStorage.removeItem('bess_solar_csv_v7');
      window.location.reload();
  };

  const handleCSVContent = (csvString: string, type: 'grid' | 'solar', saveToStorage: boolean) => {
    try {
      if (saveToStorage) {
          // Use v7 keys for saving
          localStorage.setItem(type === 'grid' ? 'bess_grid_csv_v7' : 'bess_solar_csv_v7', csvString);
      }

      const lines = csvString.split(/\r?\n/);
      let startIndex = 0;
      if (type === 'solar') {
          const headerRow = lines.findIndex(l => l.toLowerCase().includes('date') || l.toLowerCase().includes('time') || l.toLowerCase().includes('kwh'));
          startIndex = headerRow !== -1 ? headerRow + 1 : 0;
      } else {
          const headerRow = lines.findIndex(l => l.toLowerCase().includes('datetime') || l.toLowerCase().includes('datum'));
          startIndex = headerRow !== -1 ? headerRow + 1 : 0;
      }
      
      const parsedGrid: DataPoint[] = [];
      const parsedSolar: SolarPoint[] = [];
      
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.includes(';') ? line.split(';') : line.split(','); 
        if (parts.length < 2) continue;
        
        const dateStr = parts[0].trim();
        const valStr = parts[1].trim();
        const valNum = parseFloat(valStr.replace(',', '.'));
        const dateObj = new Date(dateStr);
        
        if (!isNaN(valNum) && !isNaN(dateObj.getTime())) {
            if (type === 'grid') {
                parsedGrid.push({ datetime: dateObj, limitMW: valNum });
            } else {
                const mw = valNum / 1000;
                parsedSolar.push({ datetime: dateObj, generationMW: mw });
            }
        }
      }
      
      if (type === 'grid') setRawData(parsedGrid);
      else {
          setSolarData(parsedSolar);
          setShowSolarWarning(true);
      }

    } catch (e) {
      console.error("CSV Parse Error", e);
    }
  };

  const solarScaleFactor = (targetSolarMWp >= 0 && baseSolarMWp > 0) ? targetSolarMWp / baseSolarMWp : 0;
  const cscEndDate = new Date(cscEndDateStr);

  const stats: AnalysisResult = useMemo(() => {
    const yearData = getYearDataOrFallback(selectedYear, rawData);
    return runSimulation(yearData, solarData, dcCapacityMW, batteryCapacityMWh, batteryPowerMW, dcUtilizationFactor, logisticsMW, logisticsStartHour, logisticsEndHour, solarScaleFactor, cscEndDate);
  }, [rawData, solarData, selectedYear, dcCapacityMW, batteryCapacityMWh, batteryPowerMW, dcUtilizationFactor, logisticsMW, logisticsStartHour, logisticsEndHour, solarScaleFactor, cscEndDate]);

  const multiYearStats: YearlyResult[] = useMemo(() => {
    if (rawData.length === 0) return [];
    
    // Filter availableYears to only show years >= startYear
    const filteredYears = availableYears.filter(y => y >= startYear);

    return filteredYears.map(year => {
        const yearData = getYearDataOrFallback(year, rawData);
        
        let cap = 0;
        if (year < startYear) {
            cap = 0;
        } else {
            const offset = year - startYear;
            if (offset === 0) cap = growthProfile[0];
            else if (offset === 1) cap = growthProfile[1];
            else if (offset === 2) cap = growthProfile[2];
            else cap = growthProfile[3];
        }

        const res = runSimulation(yearData, solarData, cap, batteryCapacityMWh, batteryPowerMW, dcUtilizationFactor, logisticsMW, logisticsStartHour, logisticsEndHour, solarScaleFactor, cscEndDate);
        
        const totalMissedMWh = res.loadDeficitMWhWithBat;
        const totalMissedKWh = totalMissedMWh * 1000;
        const dieselLiters = totalMissedKWh / (dieselKwhPerLiter || 1); 
        const grossDieselCost = dieselLiters * dieselPrice;
        const avoidedGridCost = totalMissedMWh * electricityPrice;
        const netExtraCost = grossDieselCost - avoidedGridCost;
        
        const dieselPercentage = res.totalLoadConsumption > 0 ? (res.loadDeficitMWhWithBat / res.totalLoadConsumption) * 100 : 0;
        
        const maxTradingVolume = 8760 * batteryPowerMW; 
        const tradingVolumePercent = maxTradingVolume > 0 ? (res.tradingVolumePotentialMWh / maxTradingVolume) * 100 : 0;

        // Calculations for Capacity Trend Graph
        const connectionMax = 10; 
        const dcActual = cap * (dcUtilizationFactor / 100);
        const logisticsActual = year >= startYear ? logisticsMW : 0;
        
        const capLogisticsMW = logisticsActual;
        const capDcActualMW = dcActual;
        const capBatterySpaceMW = Math.max(0, connectionMax - logisticsActual - dcActual);
        const capDcContractMW = cap;

        return {
            year,
            dcDeficitWithBat: res.loadDeficitMWhWithBat,
            totalHoursRestricted: res.totalHoursRestricted,
            totalMWhRestricted: res.totalMWhRestrictedGrid, 
            cscPercentage: res.curtailmentPercentageVolume, 
            dcCapacityUsed: cap,
            grossDieselCost,
            avoidedGridCost,
            netExtraCost,
            dieselLiters, 
            solarSelfConsumption: res.totalSolarUsed,
            totalSolarGeneration: res.totalSolarGeneration,
            totalLoadConsumption: res.totalLoadConsumption,
            deficitAfterSolar: res.deficitAfterSolar,
            restrictedVolumeLoad: res.restrictedVolumeLoad,
            dieselPercentage,
            tradingVolumePotentialMWh: res.tradingVolumePotentialMWh,
            tradingVolumePercent,
            totalGridToLoad: res.totalGridToLoad,
            totalSolarToLoad: res.totalSolarToLoad,
            totalBatToLoad: res.totalBatToLoad,
            capLogisticsMW,
            capDcActualMW,
            capBatterySpaceMW,
            capDcContractMW
        };
    });
  }, [rawData, solarData, availableYears, startYear, growthProfile, batteryCapacityMWh, batteryPowerMW, dcUtilizationFactor, dieselKwhPerLiter, dieselPrice, electricityPrice, logisticsMW, logisticsStartHour, logisticsEndHour, solarScaleFactor, cscEndDate]);

  // SENSITIVITY ANALYSIS DATA
  const capacitySensitivityData: CapacitySensitivityResult[] = useMemo(() => {
      if (rawData.length === 0) return [];
      const yearData = getYearDataOrFallback(selectedYear, rawData);

      const caps = [2, 3, 4, 5, 6, 7];
      return caps.map(cap => {
          const res = runSimulation(yearData, solarData, cap, batteryCapacityMWh, batteryPowerMW, dcUtilizationFactor, logisticsMW, logisticsStartHour, logisticsEndHour, solarScaleFactor, cscEndDate);
          const totalMissedMWh = res.loadDeficitMWhWithBat;
          const totalMissedKWh = totalMissedMWh * 1000;
          const grossDieselCost = (totalMissedKWh / (dieselKwhPerLiter || 1)) * dieselPrice;
          const avoidedGridCost = totalMissedMWh * electricityPrice;
          return {
              capacityMW: cap,
              deficitMWh: totalMissedMWh,
              netExtraCost: grossDieselCost - avoidedGridCost,
              tradingHours: res.tradingHoursAvailable,
              tradingVolume: res.tradingVolumePotentialMWh 
          };
      });
  }, [rawData, solarData, selectedYear, batteryCapacityMWh, batteryPowerMW, dcUtilizationFactor, dieselKwhPerLiter, dieselPrice, electricityPrice, logisticsMW, logisticsStartHour, logisticsEndHour, solarScaleFactor, cscEndDate]);


  // Robust formatting functions
  const fmtNum = (n: number | undefined | null) => {
    if (n == null || isNaN(n)) return '0';
    return n.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };
  
  const fmtMWh = (n: number | undefined | null) => {
    if (n == null || isNaN(n)) return '0';
    // Round to whole numbers if >= 1000, else keep 1 decimal
    const digits = Math.abs(n) >= 1000 ? 0 : 1;
    return n.toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  };

  const fmtEuro = (n: number | undefined | null) => {
    if (n == null || isNaN(n)) return '€0';
    return n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // Current year diesel stats
  const totalMissedKWh = stats.loadDeficitMWhWithBat * 1000;
  const dieselLitersNeeded = totalMissedKWh / (dieselKwhPerLiter || 1);
  const grossDieselCost = dieselLitersNeeded * dieselPrice;
  const avoidedGridCost = stats.loadDeficitMWhWithBat * electricityPrice;
  const netExtraCost = grossDieselCost - avoidedGridCost;
  const effectiveMW = dcCapacityMW * (dcUtilizationFactor / 100);

  // Trading percentages
  const maxTradingVolume = 8760 * batteryPowerMW; 
  const tradingVolumePercent = (stats.tradingVolumePotentialMWh / maxTradingVolume) * 100;

  // Energy Mix Data for Chart (Stacked)
  const energyMixStackedData = [
    {
      name: 'Totaal Verbruik',
      'Direct Net': stats.totalGridToLoad,
      'Direct Zon': stats.totalSolarToLoad,
      'Uit Batterij': stats.totalBatToLoad,
      'Diesel/Tekort': stats.loadDeficitMWhWithBat,
    }
  ];

  const handlePrint = () => {
    if (!containerRef.current) return;

    // Open a new window
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Pop-up geblokkeerd. Sta pop-ups toe voor deze site om te kunnen printen.");
        return;
    }

    // Get current HTML
    const content = containerRef.current.innerHTML;
    
    // Genereer datum en tijd string
    const printDate = new Date().toLocaleString('nl-NL', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    // Write to new window with a robust print-friendly CSS structure
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Datacenter 's-Gravendeel Analyse - ${selectedYear}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @media print {
              @page { size: A4; margin: 0.5cm; }
              body { 
                font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
                padding: 0; margin: 0;
                -webkit-print-color-adjust: exact; print-color-adjust: exact;
                background: white; font-size: 10px;
              }
              .no-print, .hide-in-preview, button, label, select, input { display: none !important; }
              .grid { display: grid !important; }
              .grid-cols-2 { grid-template-columns: 1fr 1fr !important; gap: 1rem !important; }
              .grid-cols-3 { grid-template-columns: 1fr 1fr 1fr !important; gap: 1rem !important; }
              /* Fixed: Removed fixed height that caused overlap, added min-height and break avoidance */
              .chart-container { 
                  height: auto !important; 
                  min-height: 250px; 
                  width: 100% !important; 
                  page-break-inside: avoid; 
                  break-inside: avoid; 
                  margin-bottom: 1rem; 
                  display: block; 
              }
              .card-container { 
                  border: 1px solid #e2e8f0; 
                  border-radius: 0.5rem; 
                  padding: 1rem; 
                  margin-bottom: 1rem; 
                  break-inside: avoid; 
                  page-break-inside: avoid; 
                  background: white; 
                  overflow: hidden; /* Prevents internal overflow */
              }
              .print-break { page-break-before: always; height: 1px; display: block; margin: 1rem 0; }
              h1 { font-size: 1.2rem; font-weight: bold; margin-bottom: 0.25rem; color: #1e293b; }
              h2 { font-size: 1.1rem; font-weight: bold; margin-bottom: 0.5rem; border-bottom: 1px solid #333; padding-bottom: 0.25rem; margin-top: 1rem; color: #1e293b; }
              h3 { font-size: 0.9rem; font-weight: bold; margin-bottom: 0.25rem; color: #334155; }
              p { font-size: 0.7rem; color: #64748b; margin-bottom: 0.5rem; }
              table { width: 100%; border-collapse: collapse; font-size: 0.65rem; }
              th { text-align: left; background: #f8fafc; padding: 0.25rem; font-weight: 600; color: #64748b; }
              td { padding: 0.25rem; border-bottom: 1px solid #f1f5f9; color: #334155; }
              
              /* Verberg de originele titel in de content om dubbele titels te voorkomen, optioneel */
              /* .print-only h1 { display: none; } */
              .print-only { display: block !important; }
            }
          </style>
        </head>
        <body>
            <div style="padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 10px;">
                    <div>
                        <h1 style="font-size: 18px; font-weight: bold; color: #1e293b; margin: 0;">Datacenter 's-Gravendeel Analyse</h1>
                        <p style="font-size: 10px; color: #64748b; margin: 0;">Rapportage Jaar: ${selectedYear}</p>
                    </div>
                    <div style="text-align: right; font-size: 10px; color: #64748b;">
                        <div>Afdrukdatum:</div>
                        <div style="font-weight: bold; color: #1e293b;">${printDate}</div>
                    </div>
                </div>
                ${content}
            </div>
            <script>setTimeout(()=>{window.print();},1500);</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadProject = async () => {
    try {
      // Import JSZip dynamically from CDN (ESM)
      // Note: This relies on internet access and CSP allowing unpkg/cdnjs
      const { default: JSZip } = await import('https://cdn.skypack.dev/jszip');
      
      const zip = new JSZip();
      
      // 1. package.json
      const packageJson = {
        "name": "bess-analysis-tool",
        "private": true,
        "version": "1.0.0",
        "type": "module",
        "scripts": {
          "dev": "vite",
          "build": "tsc && vite build",
          "preview": "vite preview"
        },
        "dependencies": {
          "lucide-react": "^0.294.0",
          "react": "^18.2.0",
          "react-dom": "^18.2.0",
          "recharts": "^2.10.3"
        },
        "devDependencies": {
          "@types/react": "^18.2.43",
          "@types/react-dom": "^18.2.17",
          "@vitejs/plugin-react": "^4.2.1",
          "autoprefixer": "^10.4.16",
          "postcss": "^8.4.32",
          "tailwindcss": "^3.4.0",
          "typescript": "^5.2.2",
          "vite": "^5.0.8"
        }
      };
      zip.file("package.json", JSON.stringify(packageJson, null, 2));

      // 2. index.html
      const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BESS Analysis Tool</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
      zip.file("index.html", indexHtml);

      // 3. src/main.tsx
      const mainTsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;
      zip.file("src/main.tsx", mainTsx);

      // 4. src/index.css
      zip.file("src/index.css", "@tailwind base;\n@tailwind components;\n@tailwind utilities;");

      // 5. Tailwind config
      zip.file("tailwind.config.js", "export default { content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'], theme: { extend: {}, }, plugins: [], }");
      zip.file("postcss.config.js", "export default { plugins: { tailwindcss: {}, autoprefixer: {}, }, }");

      // 6. Vite config
      zip.file("vite.config.ts", "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()], })");
      
      // 7. TSConfig (Crucial for Vercel)
      const tsConfig = {
        "compilerOptions": {
          "target": "ES2020",
          "useDefineForClassFields": true,
          "lib": ["ES2020", "DOM", "DOM.Iterable"],
          "module": "ESNext",
          "skipLibCheck": true,
          "moduleResolution": "bundler",
          "allowImportingTsExtensions": true,
          "resolveJsonModule": true,
          "isolatedModules": true,
          "noEmit": true,
          "jsx": "react-jsx",
          "strict": true,
          "noUnusedLocals": true,
          "noUnusedParameters": true,
          "noFallthroughCasesInSwitch": true
        },
        "include": ["src"],
        "references": [{ "path": "./tsconfig.node.json" }]
      };
      zip.file("tsconfig.json", JSON.stringify(tsConfig, null, 2));

      // 8. TSConfig Node
      const tsConfigNode = {
        "compilerOptions": {
          "composite": true,
          "skipLibCheck": true,
          "module": "ESNext",
          "moduleResolution": "bundler",
          "allowSyntheticDefaultImports": true
        },
        "include": ["vite.config.ts"]
      };
      zip.file("tsconfig.node.json", JSON.stringify(tsConfigNode, null, 2));


      // 9. README
      zip.file("README.md", "# BESS Analysis Tool (Vercel Ready)\n\nOm dit te publiceren via Vercel:\n\n1. Kopieer de code uit de online editor.\n2. Plak deze in `src/App.tsx` (overschrijf alles).\n3. Upload deze hele map naar een nieuwe GitHub Repository.\n4. Ga naar Vercel.com -> New Project -> Importeer je GitHub repo.\n5. Klik 'Deploy'. Vercel doet de rest (installeren en bouwen).");

      // 10. Placeholder App.tsx (Robuuste versie)
      const placeholderApp = `// STAP VOOR VERCEL DEPLOYMENT:
// 1. Ga terug naar de online editor.
// 2. Kopieer ALLE code (CTRL+A, CTRL+C).
// 3. Plak het hier (vervang alles in dit bestand).
// 4. Push naar GitHub en Vercel doet de rest.

import React from 'react';

export default function App() {
  return (
    <div style={{fontFamily: 'sans-serif', textAlign: 'center', padding: '50px'}}>
      <h1>Klaar voor Vercel!</h1>
      <p>Je hebt het project gedownload.</p>
      <p style={{color: 'red', fontWeight: 'bold'}}>
        Vergeet niet de code uit de editor in dit bestand (src/App.tsx) te plakken voordat je naar GitHub uploadt!
      </p>
    </div>
  );
}`;
      zip.file("src/App.tsx", placeholderApp);

      // Generate blob
      const content = await zip.generateAsync({ type: "blob" });
      
      // Trigger download
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `bess-analysis-${selectedYear}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error("Failed to create zip:", error);
      alert("Kon het project niet inpakken. Mogelijk blokkeert de browser externe scripts.");
    }
  };

  const handleInputChange = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setter(val === '' ? 0 : Number(val));
      if (setter === setBaseSolarMWp) setShowSolarWarning(false);
  };
  
  const handleGrowthChange = (index: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      const newProfile = [...growthProfile];
      newProfile[index] = val;
      setGrowthProfile(newProfile);
  };
  
  // Create summary text function
  const getSummaryText = () => {
      const isShortage = stats.loadDeficitMWhWithBat > 0;
      const totalDemand = fmtMWh(stats.totalLoadConsumption);
      const gridMitigated = fmtMWh(stats.totalGridToLoad);
      const solarMitigated = fmtMWh(stats.totalSolarUsed);
      const batMitigated = fmtMWh(stats.totalBatToLoad);
      const shortage = fmtMWh(stats.loadDeficitMWhWithBat);
      const batteryAutonomy = stats.batteryAutonomyHours.toFixed(1);
      
      return (
        <div className="print-only mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs">
            <h3 className="font-bold text-slate-900 mb-2 border-b border-slate-200 pb-1">Samenvatting {selectedYear}</h3>
            <p className="text-slate-700 leading-relaxed">
                In het jaar <strong>{selectedYear}</strong> is de totale energievraag van het datacenter en logistiek <strong>{totalDemand} MWh</strong>. 
                Hiervan wordt <strong>{gridMitigated} MWh</strong> direct uit het net gehaald en <strong>{solarMitigated} MWh</strong> uit zonnestroom. 
                De batterij levert <strong>{batMitigated} MWh</strong> om pieken op te vangen. 
                {isShortage ? (
                    <span> Er resteert een tekort van <strong className="text-red-600">{shortage} MWh</strong>, wat opgevangen moet worden met noodstroom (diesel). De geschatte batterij-autonomie is <strong>{batteryAutonomy} uur</strong>.</span>
                ) : (
                    <span className="text-green-600 font-medium"> Er zijn geen tekorten; de batterij en zonnestroom vangen alle netbeperkingen volledig op.</span>
                )}
            </p>
        </div>
      );
  };

  return (
    <div ref={containerRef} className={`min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800 ${isPrintPreview ? 'print-preview-mode' : ''}`}>
      <style>{`
        .print-preview-mode { background: white; max-width: 21cm; margin: 2rem auto; border: 1px solid #ddd; box-shadow: 0 0 20px rgba(0,0,0,0.1); padding: 1cm !important; overflow: visible !important; height: auto !important; }
        .print-preview-mode .hide-in-preview { display: none !important; }
        .print-preview-mode .print-only { display: block !important; }
        .print-preview-mode .print-break { border-bottom: 2px dashed #ccc; margin: 2rem 0; position: relative; height: 20px; background: #f0f0f0; }
        .print-preview-mode .print-break::after { content: 'Pagina Einde (Print)'; position: absolute; right: 0; top: -1.5rem; font-size: 0.8rem; color: #666; font-weight: bold; }
        .print-only { display: none; }
      `}</style>

      {/* HEADER */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div className="hide-in-preview">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Datacenter 's-Gravendeel Analyse</h1>
          <p className="text-slate-500 mt-1">Stedin CSC Contract & Datacenter Integratie</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 md:gap-4 bg-white p-2 rounded-lg shadow-sm border border-slate-200">
             <button type="button" onClick={() => setIsPrintPreview(!isPrintPreview)} className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-md transition-colors text-sm font-medium ${isPrintPreview ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                {isPrintPreview ? <><FileText size={16}/> Sluit Rapport</> : <><FileText size={16}/> Toon Rapport</>}
             </button>
             
             <button type="button" onClick={handlePrint} className="flex items-center gap-2 cursor-pointer bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium">
                <Printer size={16} /><span>Print</span>
             </button>
             
             <button type="button" onClick={handleDownloadProject} className="flex items-center gap-2 cursor-pointer bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium" title="Download Project (ZIP)">
                <Download size={16} /><span>Project (ZIP)</span>
             </button>
             
             <button type="button" onClick={handleHardReset} className="flex items-center gap-2 cursor-pointer bg-red-100 hover:bg-red-200 text-red-700 px-3 py-2 rounded-md transition-colors text-sm font-medium" title="Harde Reset (Data wissen)">
                <RefreshCw size={16} /><span>Reset</span>
             </button>
             
             <label className="flex items-center gap-2 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium hide-in-preview">
                <Upload size={16} /><span>Grid Profiel</span><input type="file" accept=".csv, text/csv" onChange={(e) => handleFileUpload(e, 'grid')} className="hidden" onClick={(e) => (e.target as HTMLInputElement).value = ''} />
             </label>
             <label className="flex items-center gap-2 cursor-pointer bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium hide-in-preview">
                <Sun size={16} /><span>Zon Profiel</span><input type="file" accept=".csv, text/csv" onChange={(e) => handleFileUpload(e, 'solar')} className="hidden" onClick={(e) => (e.target as HTMLInputElement).value = ''} />
             </label>
             {isUsingMockData && <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded hide-in-preview">Demo Data</span>}
             {hasLoadedFromStorage && !isUsingMockData && (<button onClick={handleClearStorage} className="text-slate-400 hover:text-red-500 transition-colors hide-in-preview" title="Reset data"><Trash2 size={16}/></button>)}
        </div>
      </div>

      {/* PRINT HEADER SUMMARY */}
      <div className="print-only mb-6 border-b-2 border-slate-800 pb-4">
          <h1 className="text-2xl font-bold text-slate-900">Datacenter 's-Gravendeel - Analyse Rapport</h1>
          <div className="grid grid-cols-3 gap-4 mt-4 text-sm bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div><span className="block text-slate-500 text-xs">Scenario Jaar</span><span className="font-bold">{selectedYear}</span></div>
              <div><span className="block text-slate-500 text-xs">Start Datacenter</span><span className="font-bold">{startYear}</span></div>
              <div><span className="block text-slate-500 text-xs">Datacenter (Contract)</span><span className="font-bold">{fmtNum(dcCapacityMW)} MW</span></div>
              <div><span className="block text-slate-500 text-xs">Datacenter (Benutting)</span><span className="font-bold">{dcUtilizationFactor}% ({fmtNum(effectiveMW)} MW)</span></div>
              <div><span className="block text-slate-500 text-xs">Logistiek</span><span className="font-bold">{logisticsMW} MW</span></div>
              <div><span className="block text-slate-500 text-xs">BESS</span><span className="font-bold">{batteryPowerMW} MW / {batteryCapacityMWh} MWh</span></div>
          </div>
      </div>
      
      {/* TEXTUAL SUMMARY (NEW) */}
      {getSummaryText()}
      
      {/* PRINT ONLY SETTINGS OVERVIEW (NEW) */}
      <div className="print-only mb-6">
          <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2"><Settings size={14}/> Gebruikte Instellingen</h3>
          <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3 rounded border border-slate-200">
              <div>
                  <h4 className="font-semibold text-slate-700 mb-1">Capaciteit & Groei</h4>
                  <ul className="list-disc list-inside text-slate-600">
                      <li>Startjaar: {startYear}</li>
                      <li>Groeipad (Jaar 1-4+): {growthProfile.join(', ')} MW</li>
                      <li>DC Contract: {dcCapacityMW} MW</li>
                      <li>DC Benutting: {dcUtilizationFactor}%</li>
                      <li>Logistiek: {logisticsMW} MW ({logisticsStartHour}u - {logisticsEndHour}u)</li>
                      <li>Einde CSC: {cscEndDate.toLocaleDateString('nl-NL')}</li>
                  </ul>
              </div>
              <div>
                  <h4 className="font-semibold text-slate-700 mb-1">Energie & Batterij</h4>
                  <ul className="list-disc list-inside text-slate-600">
                      <li>Batterij: {batteryPowerMW} MW / {batteryCapacityMWh} MWh</li>
                      <li>Zon Basis: {baseSolarMWp} MWp</li>
                      <li>Zon Gewenst: {targetSolarMWp} MWp (Schaal: x{solarScaleFactor.toFixed(2)})</li>
                      {/* FIX: Diesel price now uses explicit formatting for 2 decimal places */}
                      <li>Dieselprijs: {dieselPrice.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })}/L</li>
                  </ul>
              </div>
          </div>
      </div>

      {/* MAIN CONTENT GRID */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 print:grid-cols-1 print:gap-4">
        
        {/* SETTINGS PANEL */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 no-print hide-in-preview">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Settings className="text-blue-600" size={20}/> Instellingen</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Start Datacenter/Logistiek</label>
                    <input type="number" min="2024" max="2035" value={startYear} onChange={handleInputChange(setStartYear)} className="w-full p-2 border border-slate-300 rounded-md bg-slate-50 text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Capaciteit Groeipad (MW)</label>
                    <div className="grid grid-cols-4 gap-1">
                        <div><span className="text-[10px] text-slate-400">Jaar 1</span><input type="number" value={growthProfile[0]} onChange={handleGrowthChange(0)} className="w-full p-1 border rounded text-xs" /></div>
                        <div><span className="text-[10px] text-slate-400">Jaar 2</span><input type="number" value={growthProfile[1]} onChange={handleGrowthChange(1)} className="w-full p-1 border rounded text-xs" /></div>
                        <div><span className="text-[10px] text-slate-400">Jaar 3</span><input type="number" value={growthProfile[2]} onChange={handleGrowthChange(2)} className="w-full p-1 border rounded text-xs" /></div>
                        <div><span className="text-[10px] text-slate-400">Jaar 4+</span><input type="number" value={growthProfile[3]} onChange={handleGrowthChange(3)} className="w-full p-1 border rounded text-xs" /></div>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Selecteer Jaar</label>
                    <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-md bg-slate-50">
                        {availableYears.filter(y => y >= startYear).map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Einde CSC Beperking</label>
                    <input type="date" value={cscEndDateStr} onChange={(e) => setCscEndDateStr(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md bg-slate-50 text-sm" />
                </div>
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-sm font-medium text-slate-600">Datacenter Capaciteit</label>
                        <span className="text-xs font-bold text-blue-600">Werkelijk: {fmtNum(effectiveMW)} MW</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div><div className="flex items-center gap-2"><input type="number" min="0" max="10" step="0.5" value={dcCapacityMW} onChange={handleInputChange(setDcCapacityMW)} className="w-full p-2 border border-slate-300 rounded-md bg-slate-50 text-sm" /><span className="text-slate-400 text-xs">MW</span></div><span className="text-[10px] text-slate-400">Contract</span></div>
                        <div><div className="flex items-center gap-2"><input type="number" min="10" max="100" step="5" value={dcUtilizationFactor} onChange={handleInputChange(setDcUtilizationFactor)} className="w-full p-2 border border-slate-300 rounded-md bg-slate-50 text-sm" /><span className="text-slate-400 text-xs">%</span></div><span className="text-[10px] text-slate-400">Benutting</span></div>
                    </div>
                </div>
                <div className="border-t border-slate-100 pt-4 space-y-4">
                     <div><label className="block text-sm font-medium text-slate-600 mb-1">Logistiek (MW)</label><input type="number" min="0" step="0.1" value={logisticsMW} onChange={handleInputChange(setLogisticsMW)} className="w-full p-2 border border-slate-300 rounded-md bg-slate-50 text-sm" /></div>
                     <div><label className="block text-sm font-medium text-slate-600 mb-1">Batterij (MW / MWh)</label><div className="grid grid-cols-2 gap-2"><input type="number" value={batteryPowerMW} onChange={handleInputChange(setBatteryPowerMW)} className="w-full p-2 border border-slate-300 rounded-md bg-slate-50 text-sm" /><input type="number" value={batteryCapacityMWh} onChange={handleInputChange(setBatteryCapacityMWh)} className="w-full p-2 border border-slate-300 rounded-md bg-slate-50 text-sm" /></div></div>
                </div>
            </div>
        </div>

        {/* KPI CARDS & IMPACT */}
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:col-span-3">
            {/* LEFT COLUMN: KPI Cards */}
            <div className="flex flex-col gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between card-container flex-1">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">CSC Benutting ({selectedYear})</h3>
                        <div className="flex items-baseline gap-2"><span className={`text-4xl font-bold ${stats.curtailmentPercentageVolume > 15 ? 'text-red-600' : 'text-slate-800'}`}>{stats.curtailmentPercentageVolume.toFixed(2)}%</span><span className="text-slate-500">van jaarvolume</span></div>
                        <p className="text-sm text-slate-400 mb-4">(Max 15% van MWh volume toegestaan)</p>
                        <div className="space-y-2 mt-auto">
                            <div className="flex items-center justify-between text-sm border-b border-slate-50 pb-2"><span className="text-slate-500 flex items-center gap-2"><Activity size={16}/> MWh Beperkt:</span><span className="font-medium">{fmtMWh(stats.totalMWhRestrictedGrid)} MWh</span></div>
                            <div className="flex items-center justify-between text-sm"><span className="text-slate-500 flex items-center gap-2"><Calendar size={16}/> Uren Beperkt:</span><span className="font-medium">{stats.totalHoursRestricted} uur</span></div>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Banknote size={12}/> Batterij Handelspotentieel</h4>
                    <div className="grid grid-cols-3 gap-6">
                        <div><div className="flex flex-col"><span className="text-xl font-bold text-green-600">{stats.tradingHoursAvailable}</span><span className="text-[10px] text-slate-500">uren</span></div></div>
                        <div><div className="flex flex-col"><span className="text-xl font-bold text-green-600">{fmtMWh(stats.tradingVolumePotentialMWh)}</span><span className="text-[10px] text-slate-500">MWh</span></div></div>
                        <div><div className="flex flex-col"><span className="text-xl font-bold text-green-600">{fmtNum(tradingVolumePercent)}%</span><span className="text-[10px] text-slate-500">van max cap.</span></div></div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">Beschikbare tijd, volume en % van max capaciteit (87.660 MWh) om te handelen wanneer de batterij niet nodig is voor congestiemanagement.</p>
                </div>
                {/* Solar Config Card with Inputs Restored - Added hide-in-preview class */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container hide-in-preview">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Scale size={12}/> Zonconfiguratie</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                             <span className="text-[10px] text-slate-400 block mb-1">Basis (MWp)</span>
                             <div className="relative">
                                 <input type="number" min="0" step="0.1" value={baseSolarMWp} onChange={handleInputChange(setBaseSolarMWp)} className={`w-full p-2 border rounded-md text-sm ${showSolarWarning ? 'border-red-500 bg-red-50' : 'border-slate-300'}`} />
                                 {showSolarWarning && <span className="absolute -top-6 right-0 text-[10px] text-red-500 font-bold bg-white px-1 border border-red-200 rounded shadow-sm">Check MWp!</span>}
                             </div>
                        </div>
                        <div>
                             <span className="text-[10px] text-slate-400 block mb-1">Gewenst (MWp)</span>
                             <input type="number" min="0" step="0.1" value={targetSolarMWp} onChange={handleInputChange(setTargetSolarMWp)} className="w-full p-2 border border-slate-300 rounded-md bg-slate-50 text-sm" />
                        </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Schaalfactor: x{solarScaleFactor.toFixed(2)}</p>
                </div>
            </div>

            {/* RIGHT COLUMN: Impact Card (Moved here) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between card-container h-full">
                <div>
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Impact Totaal (DC + Logistiek)</h3>
                    <div className="mb-4 border-b border-slate-100 pb-4">
                        <div className="flex justify-between items-center mb-1"><span className="text-sm text-slate-600 flex items-center gap-1"><Zap size={14} className="text-blue-500"/> Totaal Verbruik:</span><span className="font-bold text-slate-800">{fmtMWh(stats.totalLoadConsumption)} MWh</span></div>
                    </div>
                    {solarData.length > 0 && (<div className="mb-4 border-b border-slate-100 pb-4"><div className="flex justify-between items-center mb-1"><span className="text-sm text-slate-600 flex items-center gap-1"><Sun size={14} className="text-yellow-500"/> Zonnestroom:</span><span className="font-bold text-yellow-600">{fmtMWh(stats.totalSolarUsed)} MWh</span></div><p className="text-[10px] text-slate-400">Direct verbruikt + Batterij geladen</p></div>)}
                    <div className="mb-4">
                        <div className="flex justify-between items-center mb-1"><span className="text-sm text-slate-600 flex items-center gap-1"><Battery size={14} className="text-green-600"/> Tekort (met BESS):</span><span className={`font-bold text-xl ${stats.loadDeficitMWhWithBat > 0 ? 'text-orange-600' : 'text-green-600'}`}>{fmtMWh(stats.loadDeficitMWhWithBat)} MWh</span></div>
                        <div className="flex items-center gap-2 mt-1 bg-slate-50 p-2 rounded border border-slate-100"><Clock size={14} className="text-slate-400"/><span className="text-xs text-slate-600">Geschatte autonomie: <strong>{stats.batteryAutonomyHours.toFixed(1)} uur</strong></span></div>
                    </div>
                    {stats.loadDeficitMWhWithBat > 0 ? (
                        <div className="mt-auto bg-slate-50 rounded-lg p-3 border border-slate-100"><h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Fuel size={12}/> Netto Extra Kosten</h4><div className="space-y-1 text-sm"><div className="flex justify-between text-slate-500"><span>Diesel:</span><span>{fmtEuro(grossDieselCost)}</span></div><div className="flex justify-between text-slate-500"><span>Min Stroom:</span><span className="text-green-600">-{fmtEuro(avoidedGridCost)}</span></div><div className="flex justify-between border-t border-slate-200 pt-1 mt-1 font-bold text-slate-800"><span>Netto:</span><span>{fmtEuro(netExtraCost)}</span></div></div></div>
                    ) : (<div className="mt-auto flex items-start gap-2 text-xs text-green-700 bg-green-50 p-2 rounded"><Activity size={14} className="mt-0.5 flex-shrink-0" />Geen noodstroom nodig.</div>)}
                </div>
            </div>
        </div>
      </div>

      <div className="print-break"></div>

      {/* PAGE 1 CHARTS */}
      <div className="max-w-7xl mx-auto mb-8 bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><BarChart3 className="text-indigo-600" size={20}/> Seizoensverdeling: Netto Tekort & Mitigatie</h3>
                    <p className="text-xs text-slate-500 mt-1"><span className="text-indigo-500 font-bold">Blauw (Achtergrond)</span> = Bruto CSC Beperking. <span className="text-green-600 font-bold">Groen</span> = Opgelost door Batterij, <span className="text-yellow-600 font-bold">Geel</span> = Opgelost door Zon, <span className="text-red-500 font-bold">Rood</span> = Resterend Tekort (Diesel). <span className="text-indigo-500 font-bold">Paarse lijn</span> = Uren Bruto CSC.</p>
                </div>
            </div>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={stats.monthlyStats} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" />
                        <YAxis yAxisId="left" label={{ value: 'MWh', angle: -90, position: 'insideLeft' }} />
                        <YAxis yAxisId="right" orientation="right" label={{ value: 'Uren', angle: 90, position: 'insideRight' }} />
                        <Tooltip formatter={(val: number) => fmtNum(val)} cursor={{fill: '#f1f5f9'}}/>
                        <Legend />
                        <Bar yAxisId="left" dataKey="restrictedMWh" name="Bruto CSC Beperking" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={50} fillOpacity={0.3} />
                        <Bar yAxisId="left" dataKey="deficitMitigatedByBat" stackId="a" name="Opgelost door Batterij" fill="#10b981" barSize={30} />
                        <Bar yAxisId="left" dataKey="deficitMitigatedBySolar" stackId="a" name="Opgelost door Zon" fill="#facc15" barSize={30} />
                        <Bar yAxisId="left" dataKey="deficitNet" stackId="a" name="Netto Tekort (Diesel)" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={30} />
                        <Line yAxisId="right" type="monotone" dataKey="restrictedHours" name="Uren Bruto CSC Beperking" stroke="#6366f1" strokeWidth={2} dot={{r:3}} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
      </div>

      {/* ENERGY MIX CHART + SOLAR + TRADING */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 print:gap-4">
          
          {/* ENERGY MIX CHART */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
                <div className="flex justify-between items-center mb-6">
                    <div><h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><PieIcon className="text-emerald-600" size={20}/> Energiemix ({selectedYear})</h3><p className="text-xs text-slate-500 mt-1">Waar komt de stroom voor het datacenter vandaan?</p></div>
                </div>
                <div className="h-[300px] w-full flex justify-center">
                    <div className="w-full h-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={energyMixStackedData} margin={{ top: 20, right: 120, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                                <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 'bold' }} />
                                <YAxis label={{ value: 'MWh', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                                <Tooltip 
                                    formatter={(val: number) => fmtMWh(val)} 
                                    cursor={{fill: 'transparent'}}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }}/>
                                <Bar dataKey="Direct Net" stackId="a" fill="#3b82f6" barSize={80}><LabelList dataKey="Direct Net" content={(props: any) => <CustomizedLabel {...props} formatter={fmtMWh} index={0} total={stats.totalLoadConsumption} />}/></Bar>
                                <Bar dataKey="Direct Zon" stackId="a" fill="#fbbf24" barSize={80}><LabelList dataKey="Direct Zon" content={(props: any) => <CustomizedLabel {...props} formatter={fmtMWh} index={1} total={stats.totalLoadConsumption} />}/></Bar>
                                <Bar dataKey="Uit Batterij" stackId="a" fill="#10b981" barSize={80}><LabelList dataKey="Uit Batterij" content={(props: any) => <CustomizedLabel {...props} formatter={fmtMWh} index={2} total={stats.totalLoadConsumption} />}/></Bar>
                                <Bar dataKey="Diesel/Tekort" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={80}><LabelList dataKey="Diesel/Tekort" content={(props: any) => <CustomizedLabel {...props} formatter={fmtMWh} index={3} total={stats.totalLoadConsumption} />}/></Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
          </div>

          {/* SOLAR CHART */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div><h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Sun className="text-yellow-500" size={20}/> Zonnestroom Analyse ({selectedYear})</h3><p className="text-xs text-slate-500 mt-1">Vergelijking opwekking vs. nuttig gebruik.</p></div>
            </div>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.monthlyStats} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" />
                        <YAxis label={{ value: 'MWh', angle: -90, position: 'insideLeft' }} />
                        <Tooltip formatter={(val: number) => fmtNum(val)} cursor={{fill: '#f1f5f9'}}/>
                        <Legend payload={[{ value: `Opwekking (${fmtMWh(stats.totalSolarGeneration)} MWh)`, type: 'rect', color: '#fbbf24' }, { value: `Benut (${fmtMWh(stats.totalSolarUsed)} MWh)`, type: 'rect', color: '#10b981' }]} />
                        <Bar dataKey="solarGeneration" name="Opwekking" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="solarUsed" name="Benut" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
          </div>
      </div>

      <div className="print-break"></div>

      {/* FREQ & IMPACT */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 print:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Frequentie</h3>
            <p className="text-xs text-slate-500 mb-4">Hoe vaak komt een beperking van een bepaalde tijdsduur voor?</p>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.distribution} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="duration" label={{ value: 'Duur (uur)', position: 'insideBottom', offset: -10 }} />
                        <YAxis label={{ value: 'Keer', angle: -90, position: 'insideLeft' }} />
                        <Bar dataKey="frequency" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Impact (MWh)</h3>
            <p className="text-xs text-slate-500 mb-4">Hoeveel energie kon er in totaal niet geleverd worden bij beperkingen van deze duur?</p>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.distribution} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="duration" label={{ value: 'Duur (uur)', position: 'insideBottom', offset: -10 }} />
                        <YAxis label={{ value: 'MWh', angle: -90, position: 'insideLeft' }} />
                        <Bar dataKey="totalMWhCurtailed" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      <div className="print-break"></div>

      {/* MULTI YEAR SECTION */}
      <div className="print-only mb-6 mt-8 border-b-2 border-slate-800 pb-2"><h2 className="text-xl font-bold text-slate-900">Meerjaren & Detail Analyse</h2></div>

      {/* CSC UTILIZATION TABLE (RESTORED) */}
      <div className="max-w-7xl mx-auto mb-8 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden card-container">
          <div className="p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="text-blue-600" size={18}/> CSC Benutting & Mitigatie per Jaar
              </h3>
              <p className="text-xs text-slate-500">Overzicht van beperkingen en hoe deze zijn opgevangen. Alle volumes in MWh.</p>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium">
                      <tr>
                          <th className="px-3 py-1">Jaar</th>
                          <th className="px-3 py-1 text-right">Beperkt % CSC</th>
                          <th className="px-3 py-1 text-right">Beperkt Vol. CSC</th>
                          <th className="px-3 py-1 text-right">Beperkt Vol DC</th>
                          <th className="px-3 py-1 text-right">Na Zon</th>
                          <th className="px-3 py-1 text-right">Na Batterij (Tekort)</th>
                          <th className="px-3 py-1 text-right">Diesel %</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {multiYearStats.map((stat) => {
                          const totalYearlyMWh = 87660;
                          const restrictedPct = (stat.restrictedVolumeLoad / totalYearlyMWh) * 100;
                          const afterSolarPct = (stat.deficitAfterSolar / totalYearlyMWh) * 100;
                          const afterBatPct = (stat.dcDeficitWithBat / totalYearlyMWh) * 100;

                          return (
                              <tr key={stat.year} className="hover:bg-slate-50">
                                  <td className="px-3 py-1 font-mono font-bold text-slate-700">{stat.year}</td>
                                  <td className="px-3 py-1 text-right">
                                      <span className={`font-bold ${stat.cscPercentage > 15 ? 'text-red-600' : 'text-green-600'}`}>
                                          {fmtNum(stat.cscPercentage)}%
                                      </span>
                                  </td>
                                  <td className="px-3 py-1 text-right">{fmtMWh(stat.totalMWhRestricted)}</td>
                                  <td className="px-3 py-1 text-right text-slate-600">
                                      {fmtMWh(stat.restrictedVolumeLoad)} <span className="text-slate-400 text-[10px]">({fmtNum(restrictedPct)}%)</span>
                                  </td>
                                  <td className="px-3 py-1 text-right">
                                      {fmtMWh(stat.deficitAfterSolar)} <span className="text-slate-400 text-[10px]">({fmtNum(afterSolarPct)}%)</span>
                                  </td>
                                  <td className="px-3 py-1 text-right font-bold text-red-600">
                                      {fmtMWh(stat.dcDeficitWithBat)} <span className="text-slate-400 text-[10px] font-normal">({fmtNum(afterBatPct)}%)</span>
                                  </td>
                                  <td className="px-3 py-1 text-right">
                                      <span className={`font-bold ${stat.dieselPercentage > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                          {fmtNum(stat.dieselPercentage)}%
                                      </span>
                                  </td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
          <div className="p-3 border-t border-slate-100 bg-slate-50">
              <p className="text-[10px] text-slate-500 italic">
                  * Noot: De percentages bij 'Beperkt % CSC', 'Beperkt Vol. CSC', 'Na Zon' en 'Na Batterij' zijn berekend t.o.v. de maximale jaarlijkse netcapaciteit (87.660 MWh). 
                  Het percentage in de kolom 'Diesel %' is berekend t.o.v. de daadwerkelijke energievraag van het datacenter in dat specifieke jaar.
              </p>
          </div>
      </div>

      <div className="max-w-7xl mx-auto mb-8 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden card-container">
          <div className="p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><PieIcon className="text-emerald-600" size={18}/> Energiemix Verloop per Jaar</h3>
              <p className="text-xs text-slate-500">Overzicht van de herkomst van de benodigde energie per jaar, verdeeld over net, zon, batterij en eventuele tekorten.</p>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium">
                      <tr><th className="px-3 py-1">Jaar</th><th className="px-3 py-1 text-right">Totaal Verbruik (MWh)</th><th className="px-3 py-1 text-right">Direct Net (MWh)</th><th className="px-3 py-1 text-right">Direct Zon (MWh)</th><th className="px-3 py-1 text-right">Uit Batterij (MWh)</th><th className="px-3 py-1 text-right">Diesel/Tekort (MWh)</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {multiYearStats.map((stat) => {
                          const total = stat.totalLoadConsumption;
                          const netPct = total > 0 ? (stat.totalGridToLoad / total * 100) : 0;
                          const sunPct = total > 0 ? (stat.totalSolarToLoad / total * 100) : 0;
                          const batPct = total > 0 ? (stat.totalBatToLoad / total * 100) : 0;
                          const dslPct = total > 0 ? (stat.dcDeficitWithBat / total * 100) : 0;
                          return (
                              <tr key={stat.year} className="hover:bg-slate-50">
                                  <td className="px-3 py-1 font-mono font-bold text-slate-700">{stat.year}</td>
                                  <td className="px-3 py-1 text-right font-bold">{fmtMWh(total)}</td>
                                  <td className="px-3 py-1 text-right text-blue-600">{fmtMWh(stat.totalGridToLoad)} <span className="text-slate-400 text-[10px]">({fmtNum(netPct)}%)</span></td>
                                  <td className="px-3 py-1 text-right text-yellow-600">{fmtMWh(stat.totalSolarToLoad)} <span className="text-slate-400 text-[10px]">({fmtNum(sunPct)}%)</span></td>
                                  <td className="px-3 py-1 text-right text-green-600">{fmtMWh(stat.totalBatToLoad)} <span className="text-slate-400 text-[10px]">({fmtNum(batPct)}%)</span></td>
                                  <td className="px-3 py-1 text-right text-red-600 font-bold">{fmtMWh(stat.dcDeficitWithBat)} <span className="text-slate-400 text-[10px] font-normal">({fmtNum(dslPct)}%)</span></td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 print:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2"><TrendingUp className="text-blue-600" size={20}/> Meerjaren: Tekort & Kosten</h3>
            <p className="text-xs text-slate-500 mb-4">Relatie tussen tekort (MWh) en netto kosten (€) per jaar.</p>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={multiYearStats} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="year" />
                        <YAxis yAxisId="left" label={{ value: 'MWh', angle: -90, position: 'insideLeft' }} />
                        <YAxis yAxisId="right" orientation="right" tickFormatter={(val) => `€${val/1000}k`} />
                        <Tooltip formatter={(value: number, name: string) => [name === 'netExtraCost' ? fmtEuro(value) : fmtNum(value), name === 'netExtraCost' ? 'Netto Kosten' : 'Tekort (MWh)']} />
                        <Bar yAxisId="left" dataKey="dcDeficitWithBat" name="Tekort (MWh)" fill="#f97316" radius={[4, 4, 0, 0]} barSize={30} />
                        <Line yAxisId="right" type="monotone" dataKey="netExtraCost" name="Netto Kosten (€)" stroke="#10b981" strokeWidth={3} dot={{r:4}} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
        
        {/* NEW CHART: Diesel Liters Trend */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2"><Fuel className="text-orange-600" size={20}/> Verwacht Dieselverbruik (Liters)</h3>
            <p className="text-xs text-slate-500 mb-4">Geschat aantal liters diesel benodigd voor noodstroom per jaar.</p>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={multiYearStats} margin={{ top: 20, right: 30, left: 15, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="year" />
                        <YAxis label={{ value: 'Liters', angle: -90, position: 'insideLeft', offset: 0 }} />
                        <Tooltip formatter={(value: number) => [`${Math.round(value).toLocaleString('nl-NL')} L`, 'Diesel']} />
                        <Bar dataKey="dieselLiters" name="Diesel (L)" fill="#ea580c" radius={[4, 4, 0, 0]} barSize={40}>
                             <LabelList dataKey="dieselLiters" position="top" formatter={(val: number) => val > 0 ? `${Math.round(val/1000)}k` : ''} fontSize={10} fill="#ea580c" />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      {/* ENERGY MIX GRAPHS ROW */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 print:gap-4">
        {/* Energy Mix MWh */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2"><PieIcon className="text-blue-600" size={20}/> Energiemix Trend (MWh)</h3>
            <p className="text-xs text-slate-500 mb-4">Absolute volumes per energiebron over de jaren heen.</p>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={multiYearStats} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="year" />
                        <YAxis label={{ value: 'MWh', angle: -90, position: 'insideLeft' }} />
                        <Tooltip formatter={(value: number, name: string) => {
                            let label = '';
                            if (name === 'totalGridToLoad') label = 'Direct Net';
                            if (name === 'totalSolarToLoad') label = 'Direct Zon';
                            if (name === 'totalBatToLoad') label = 'Uit Batterij';
                            if (name === 'dcDeficitWithBat') label = 'Diesel/Tekort';
                            return [`${fmtMWh(value)} MWh`, label];
                        }} />
                        <Legend />
                        <Bar dataKey="totalGridToLoad" name="Net" stackId="a" fill="#3b82f6" />
                        <Bar dataKey="totalSolarToLoad" name="Zon" stackId="a" fill="#fbbf24" />
                        <Bar dataKey="totalBatToLoad" name="Batterij" stackId="a" fill="#10b981" />
                        <Bar dataKey="dcDeficitWithBat" name="Diesel" stackId="a" fill="#ef4444" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Energy Mix Percentage (Moved here) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2"><PieIcon className="text-purple-600" size={20}/> Energiemix Trend (Percentage)</h3>
            <p className="text-xs text-slate-500 mb-4">Ontwikkeling van de energiebronnen over de jaren heen (100% gestapeld).</p>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={multiYearStats} margin={{ top: 20, right: 30, left: 10, bottom: 5 }} stackOffset="expand">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="year" />
                        <YAxis tickFormatter={(val) => `${(val * 100).toFixed(0)}%`} />
                        <Tooltip formatter={(value: number, name: string) => {
                            let label = '';
                            if (name === 'totalGridToLoad') label = 'Direct Net';
                            if (name === 'totalSolarToLoad') label = 'Direct Zon';
                            if (name === 'totalBatToLoad') label = 'Uit Batterij';
                            if (name === 'dcDeficitWithBat') label = 'Diesel/Tekort';
                            return [`${fmtMWh(value)} MWh`, label];
                        }} />
                        <Legend />
                        <Bar dataKey="totalGridToLoad" name="Net" stackId="a" fill="#3b82f6" />
                        <Bar dataKey="totalSolarToLoad" name="Zon" stackId="a" fill="#fbbf24" />
                        <Bar dataKey="totalBatToLoad" name="Batterij" stackId="a" fill="#10b981" />
                        <Bar dataKey="dcDeficitWithBat" name="Diesel" stackId="a" fill="#ef4444" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      {/* NEW SECTION: Capacity & Trading Trends */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 print:gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Banknote className="text-purple-600" size={20}/> Handelsvolume Trend</h3>
                        <p className="text-xs text-slate-500 mt-1">Percentage van de maximale BESS capaciteit beschikbaar voor handel.</p>
                    </div>
                </div>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={multiYearStats} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="year" />
                            <YAxis label={{ value: 'Beschikbaar %', angle: -90, position: 'insideLeft' }} domain={[0, 100]} />
                            <Tooltip formatter={(val: number) => `${fmtNum(val)}%`} />
                            <Line type="monotone" dataKey="tradingVolumePercent" name="% Beschikbaar" stroke="#8b5cf6" strokeWidth={3} dot={{r:4}} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><ZapIcon className="text-orange-500" size={20}/> Capaciteitsverdeling Trend (MW)</h3>
                        <p className="text-xs text-slate-500 mt-1">Verdeling van 10MW netaansluiting.</p>
                    </div>
                </div>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={multiYearStats} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="year" />
                            <YAxis label={{ value: 'MW', angle: -90, position: 'insideLeft' }} domain={[0, 10]} />
                            <Tooltip formatter={(val: number) => `${val.toFixed(2)} MW`} />
                            <Legend iconType="rect" />
                            {/* Stacks for Area - Using MW values directly */}
                            <Area type="step" dataKey="capLogisticsMW" name="Logistiek" stackId="1" stroke="#64748b" fill="#94a3b8" />
                            <Area type="step" dataKey="capDcActualMW" name="DC Werkelijk" stackId="1" stroke="#f97316" fill="#fdba74" />
                            <Area type="step" dataKey="capBatterySpaceMW" name="Rest voor Batterij" stackId="1" stroke="#22c55e" fill="#86efac" />
                            
                            {/* Contract Line - Needs to be total height of Log + Contract DC */}
                            <Line type="step" dataKey={(d) => d.capDcContractMW + d.capLogisticsMW} name="Gecontracteerd Totaal" stroke="#000" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
          </div>
      </div>
      
      {/* SENSITIVITY ANALYSIS SECTION (RESTORED) */}
      <div className="print-break"></div>
      <div className="print-only mb-6 mt-8 border-b-2 border-slate-800 pb-2"><h2 className="text-xl font-bold text-slate-900">Scenario Analyse: Impact DC Grootte</h2></div>
      
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 print:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><TrendingDown className="text-blue-600" size={20}/> Kostenanalyse ({selectedYear})</h3>
                    <p className="text-xs text-slate-500 mt-1">Impact van datacenter capaciteit op de netto extra kosten in het geselecteerde jaar.</p>
                </div>
            </div>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={capacitySensitivityData} margin={{ top: 30, right: 30, left: 50, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="capacityMW" label={{ value: 'Datacenter Capaciteit (MW)', position: 'insideBottom', offset: -30, style: { textAnchor: 'middle', fill: '#64748b', fontSize: 12 } }} />
                        <YAxis label={{ value: 'Netto Kosten (€)', angle: -90, position: 'insideLeft', offset: 0, style: { textAnchor: 'middle', fill: '#64748b', fontSize: 12 } }} tickFormatter={(val) => `€${val/1000}k`} />
                        <Tooltip formatter={(value: number) => fmtEuro(value)} />
                        <Line type="monotone" dataKey="netExtraCost" name="Netto Extra Kosten" stroke="#10b981" strokeWidth={3} dot={{r:5}}>
                            <LabelList dataKey="netExtraCost" position="top" offset={15} formatter={(val: number) => `€${Math.round(val/1000)}k`} fill="#10b981" fontWeight="bold" fontSize={12} />
                        </Line>
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Banknote className="text-purple-600" size={20}/> Handelsuren Analyse ({selectedYear})</h3>
                    <p className="text-xs text-slate-500 mt-1">Hoeveel uren en MWh blijven er over voor handel bij verschillende DC groottes?</p>
                </div>
            </div>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={capacitySensitivityData} margin={{ top: 30, right: 30, left: 50, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="capacityMW" label={{ value: 'Datacenter Capaciteit (MW)', position: 'insideBottom', offset: -30, style: { textAnchor: 'middle', fill: '#64748b', fontSize: 12 } }} />
                        <YAxis yAxisId="left" label={{ value: 'Uren', angle: -90, position: 'insideLeft', offset: 0, style: { textAnchor: 'middle', fill: '#64748b', fontSize: 12 } }} />
                        <YAxis yAxisId="right" orientation="right" label={{ value: 'Volume (MWh)', angle: 90, position: 'insideRight', offset: 10, style: { textAnchor: 'middle', fill: '#10b981', fontSize: 12 } }} />
                        <Tooltip formatter={(value: number, name: string) => [Math.round(value), name === 'tradingHours' ? 'Uren' : 'MWh']} />
                        <Line yAxisId="left" type="monotone" dataKey="tradingHours" name="Handelsuren" stroke="#8b5cf6" strokeWidth={3} dot={{r:4}} />
                        <Bar yAxisId="right" dataKey="tradingVolume" name="Handelsvolume" fill="#10b981" barSize={20} opacity={0.6} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      <div className="print-break"></div>

      {/* DETAIL TABLES */}
      <div className="print-only mb-6 mt-8 border-b-2 border-slate-800 pb-2"><h2 className="text-xl font-bold text-slate-900">Gebeurtenissen Log</h2></div>
      
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 print:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden card-container">
            <div className="p-4 border-b border-slate-100"><h3 className="font-bold text-slate-900 flex items-center gap-2"><List className="text-blue-600" size={18}/> Top 5 Beperkingen</h3><p className="text-xs text-slate-500">Langste aaneengesloten periodes van netbeperking.</p></div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium"><tr><th className="px-4 py-2">Start</th><th className="px-4 py-2">Duur</th><th className="px-4 py-2">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {stats.events.sort((a,b)=>b.durationHours-a.durationHours).slice(0,5).map((e,i)=>(<tr key={i}><td className="px-4 py-2">{e.start.toLocaleDateString()} {e.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td><td className="px-4 py-2 font-bold">{e.durationHours}u</td><td className="px-4 py-2">{e.mitigated ? <span className="text-green-600">Opgelost</span> : <span className="text-red-600">Uitval</span>}</td></tr>))}
                    </tbody>
                </table>
            </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden card-container">
            <div className="p-4 border-b border-slate-100"><h3 className="font-bold text-slate-900 flex items-center gap-2"><AlertOctagon className="text-red-600" size={18}/> Top 5 Tekorten</h3><p className="text-xs text-slate-500">Momenten met daadwerkelijke stroomuitval bij het datacenter.</p></div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium"><tr><th className="px-4 py-2">Start</th><th className="px-4 py-2">Duur</th><th className="px-4 py-2">Tekort</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {stats.outageEvents.length > 0 ? stats.outageEvents.sort((a,b)=>b.durationHours-a.durationHours).slice(0,5).map((e,i)=>(<tr key={i}><td className="px-4 py-2">{e.start.toLocaleDateString()} {e.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td><td className="px-4 py-2 font-bold text-red-600">{e.durationHours}u</td><td className="px-4 py-2">{fmtNum(e.totalMissedMWh)} MWh</td></tr>)) : <tr><td colSpan={3} className="px-4 py-2 text-center text-slate-400">Geen uitval</td></tr>}
                    </tbody>
                    {stats.outageEvents.length > 0 && (
                        <tfoot className="bg-slate-50 font-bold text-slate-700">
                            <tr>
                                <td className="px-4 py-2" colSpan={2}>Totaal Top 5</td>
                                <td className="px-4 py-2">
                                    {(() => {
                                        const sum = stats.outageEvents.sort((a,b)=>b.durationHours-a.durationHours).slice(0,5).reduce((acc, curr) => acc + curr.totalMissedMWh, 0);
                                        const pct = stats.loadDeficitMWhWithBat > 0 ? (sum / stats.loadDeficitMWhWithBat) * 100 : 0;
                                        return (
                                            <span>{fmtNum(sum)} MWh <span className="text-xs font-normal text-slate-500">({fmtNum(pct)}%)</span></span>
                                        );
                                    })()}
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
      </div>
      
      {/* WORST WEEK CHART */}
      {stats.worstWeekData.length > 0 && (
          <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-6 card-container chart-container">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-1">
                  <TrendingDown className="text-red-500" size={20}/> Slechtste Week ({selectedYear})
              </h3>
              <p className="text-xs text-slate-500 mb-4">Verloop van de batterij (zwart) en de netcapaciteit (oranje vlak) tijdens de zwaarste week.</p>
              <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={stats.worstWeekData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="datetime" tickFormatter={(d) => `${d.getDate()}/${d.getMonth()+1}`} minTickGap={30} />
                          <YAxis yAxisId="left" domain={[0, batteryCapacityMWh]}/>
                          <YAxis yAxisId="right" orientation="right" domain={[0, 12]}/>
                          <Area yAxisId="right" type="step" dataKey="gridLimit" fill="#fed7aa" stroke="none" fillOpacity={0.5} />
                          <Line yAxisId="left" type="monotone" dataKey="socEnd" stroke="#0f172a" strokeWidth={2} dot={false} />
                      </ComposedChart>
                  </ResponsiveContainer>
              </div>
          </div>
      )}

    </div>
  );
};

export default App;