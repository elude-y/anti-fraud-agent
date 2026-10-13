"use client";

import { useState } from "react";
import Link from "next/link";

export default function AnalysisPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFile(e.target.files[0]);
  };

  const handleAnalyze = () => {
    setLoading(true);
    // TODO: 这里后续需要接入后端的 API 接口
    setTimeout(() => {
      alert("分析功能正在开发中，等待接入 AI 后端...");
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black min-h-screen p-8">
      <main className="flex flex-col w-full max-w-2xl gap-8 p-10 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold text-center text-black dark:text-zinc-50">
          📊 反欺诈数据分析
        </h1>
        
        <div className="flex flex-col items-center gap-4 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-10">
          <p className="text-zinc-500">请上传需要分析的交易数据（CSV / JSON）</p>
          <input 
            type="file" 
            accept=".csv,.json" 
            onChange={handleUpload}
            className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {file && <p className="text-sm text-green-600">已选择：{file.name}</p>}
        </div>

        <div className="flex justify-between mt-4">
          <Link href="/" className="px-6 py-2 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            返回首页
          </Link>
          <button 
            onClick={handleAnalyze} 
            disabled={!file || loading}
            className="px-8 py-2 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "分析中..." : "开始分析"}
          </button>
        </div>
      </main>
    </div>
  );
}