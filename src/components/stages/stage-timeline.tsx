"use client";

import {
  Brain,
  CheckCircle,
  Cube,
  Fingerprint,
  Gauge,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "framer-motion";
import styles from "./stage-timeline.module.css";

const stages = [
  { label: "输入规范化", detail: "提取链接、实体与风险词", icon: Fingerprint },
  { label: "案例库检索", detail: "匹配相似反诈案例", icon: MagnifyingGlass },
  { label: "置信度评估", detail: "融合相似度与覆盖度", icon: Gauge },
  { label: "沙箱验证", detail: "检查页面行为与 IOC", icon: Cube },
  { label: "综合研判", detail: "交叉验证多源证据", icon: Brain },
  { label: "生成结论", detail: "输出等级与处置建议", icon: CheckCircle },
] as const;

interface StageTimelineProps {
  activeStage: number;
  completedStages: number;
  skippedStages: number[];
}

export default function StageTimeline({ activeStage, completedStages, skippedStages }: StageTimelineProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={styles.timeline} aria-label="研判阶段进度" aria-live="polite">
      {stages.map((stage, index) => {
        const Icon = stage.icon;
        const skipped = skippedStages.includes(index);
        const done = index < completedStages && !skipped;
        const active = index === activeStage;

        return (
          <motion.div
            className={`${styles.item} ${done ? styles.done : ""} ${active ? styles.active : ""} ${skipped ? styles.skipped : ""}`}
            key={stage.label}
            initial={reduceMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reduceMotion ? 0 : index * 0.035, duration: reduceMotion ? 0 : 0.22 }}
          >
            <span className={styles.icon}>
              {done ? <CheckCircle size={19} weight="fill" /> : <Icon size={19} />}
            </span>
            <span className={styles.copy}>
              <strong>{stage.label}</strong>
              <small>{skipped ? "高置信度快速路径无需沙箱" : stage.detail}</small>
            </span>
            <span className={styles.state}>{skipped ? "跳过" : done ? "完成" : active ? "处理中" : "等待"}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
