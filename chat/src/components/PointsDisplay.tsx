import { usePoints } from "@/contexts/PointsContext";
import { useAuth } from "@/contexts/AuthContext";
import { MAX_BALANCE, getNextRewardTimeLeft } from "@/lib/points";
import { Coins, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

const PointsDisplay = () => {
  const { balance, loading, lastRewardedRoundAt, refreshPoints } = usePoints();
  const { isAdmin, isStaff } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  if (loading) return null;

  const nextReward = getNextRewardTimeLeft(lastRewardedRoundAt);
  const percentage = Math.min((balance / MAX_BALANCE) * 100, 100);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshPoints();
    setRefreshing(false);
    toast.success("تم تحديث النقاط");
  };

  return (
    <div className="bg-card border rounded-xl p-3 mb-4 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Coins className="w-4 h-4 text-yellow-500" />
          <span className="text-sm font-bold">
            {isAdmin || isStaff ? "∞" : balance}
            <span className="text-muted-foreground font-normal text-xs"> / {MAX_BALANCE}</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {!isAdmin && !isStaff && nextReward && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>مكافأة الجولة: {nextReward}</span>
          </div>
        )}
        {(isAdmin || isStaff) && (
          <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">بدون حد</span>
        )}
      </div>
      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor:
              percentage >= 80
                ? "hsl(var(--primary))"
                : percentage >= 40
                ? "hsl(45, 90%, 50%)"
                : "hsl(0, 70%, 55%)",
          }}
        />
      </div>
    </div>
  );
};

export default PointsDisplay;
