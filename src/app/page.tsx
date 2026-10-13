import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-col items-center justify-center text-center gap-8 p-8">
        <h1 className="text-5xl font-bold text-black dark:text-zinc-50 tracking-tight">
          🛡️ 反欺诈代理
        </h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
          基于 AI 的智能反欺诈分析系统。上传数据，一键识别潜在风险与欺诈行为。
        </p>
        
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-white transition-colors hover:bg-blue-700"
            href="/analysis" // 这里是你要跳转的页面
          >
            开始分析
          </a>
          <a
            className="flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-8 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            href="https://github.com/elude-y/anti-fraud-agent"
            target="_blank"
          >
            项目仓库
          </a>
        </div>
      </main>
    </div>
  );
}