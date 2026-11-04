import type { ReactNode } from "react";
import { Star, Shield, Zap, Trophy, Award } from "lucide-react";

export interface BadgeData {
  code: string;
  name_ar: string;
  icon: string;
  color: string;
}

export interface LevelData {
  level: string;
  level_name: string;
  level_icon: string;
  level_color: string;
  score: number;
}

const iconMap: Record<string, typeof Shield> = {
  trusted: Shield,
  fastest: Zap,
  professional: Trophy,
  top_rated: Award,
};

export function ReputationBadge({ badge, size = "md" }: { badge: BadgeData; size?: "sm" | "md" }) {
  const Icon = iconMap[badge.code] ?? Star;
  const sz = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const txt = size === "sm" ? "text-[9px]" : "text-[10px]";
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold"
      style={{ backgroundColor: `${badge.color}1a`, color: badge.color, border: `1px solid ${badge.color}40` }}
    >
      <Icon className={sz} />
      <span className={txt}>{badge.name_ar}</span>
    </div>
  );
}

export function BadgeRow({ badges }: { badges: BadgeData[] }) {
  if (!badges?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <ReputationBadge key={b.code} badge={b} />
      ))}
    </div>
  );
}

export function LevelBadge({ level }: { level: LevelData }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 font-black text-sm"
      style={{ backgroundColor: `${level.level_color}1a`, color: level.level_color, border: `1px solid ${level.level_color}40` }}
    >
      <span className="text-base">{level.level_icon}</span>
      <span>{level.level_name}</span>
    </div>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, (score / 1000) * 100);
  const nextThreshold = [0, 150, 400, 800].find((t) => t > score) ?? 1000;
  const prevThreshold = [0, 150, 400, 800].filter((t) => t <= score).pop() ?? 0;
  const segPct = ((score - prevThreshold) / (nextThreshold - prevThreshold)) * 100;

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
        <span>النقاط: {score}</span>
        <span>{nextThreshold === 1000 ? "MAX" : nextThreshold}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow transition-all duration-700"
          style={{ width: `${Math.max(segPct, 2)}%` }}
        />
      </div>
    </div>
  );
}

export function StarRating({ stars, size = "md" }: { stars: number; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-6 w-6" : "h-4 w-4";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`${sz} ${s <= Math.round(stars) ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

export function SubScoreBar({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  const pct = (value / 5) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="text-primary/70 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-muted-foreground">{label}</span>
          <span className="text-[10px] font-bold">{Number(value).toFixed(1)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function ReputationCard({ reputation }: { reputation: any }) {
  if (!reputation) return null;

  return (
    <div className="glass rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <LevelBadge
          level={{
            level: reputation.level,
            level_name: reputation.level_name,
            level_icon: reputation.level_icon,
            level_color: reputation.level_color,
            score: reputation.score,
          }}
        />
        <StarRating stars={Number(reputation.avg_stars)} />
      </div>

      <ScoreBar score={reputation.score} />

      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-3 text-center">
          <div className="text-2xl font-black">{reputation.completed_jobs}</div>
          <div className="text-[10px] text-muted-foreground">عمل مكتمل</div>
        </div>
        <div className="glass rounded-2xl p-3 text-center">
          <div className="text-2xl font-black">{reputation.ratings_count}</div>
          <div className="text-[10px] text-muted-foreground">تقييم</div>
        </div>
      </div>

      <div className="space-y-2.5">
        <SubScoreBar label="الاحترافية" value={Number(reputation.professionalism_avg)} icon={<Trophy className="h-3.5 w-3.5" />} />
        <SubScoreBar label="الالتزام بالوقت" value={Number(reputation.punctuality_avg)} icon={<Zap className="h-3.5 w-3.5" />} />
        <SubScoreBar label="جودة العمل" value={Number(reputation.quality_avg)} icon={<Award className="h-3.5 w-3.5" />} />
      </div>

      {reputation.badges?.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-muted-foreground mb-2">الشارات</div>
          <BadgeRow badges={reputation.badges} />
        </div>
      )}
    </div>
  );
}
