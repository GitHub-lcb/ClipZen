import { useState } from "react";
import { Clipboard, Search, Pin, Trash2 } from "lucide-react";

function App() {
  const [searchQuery, setSearchQuery] = useState("");

  // 模拟数据
  const mockItems = [
    { id: "1", type: "text", content: "你好，这是测试文本", preview: "你好，这是测试文本", pinned: true, createdAt: Date.now() },
    { id: "2", type: "text", content: "https://github.com/lcb/ClipZen", preview: "https://github.com/lcb/ClipZen", pinned: false, createdAt: Date.now() - 1000 },
    { id: "3", type: "text", content: "git commit -m 'initial commit'", preview: "git commit -m 'initial commit'", pinned: false, createdAt: Date.now() - 2000 },
  ];

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
      {/* 搜索栏 */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
        <Search className="w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="搜索剪贴板历史..."
          className="flex-1 bg-transparent outline-none text-gray-700 dark:text-gray-200"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* 置顶区域 */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
          <Pin className="w-3 h-3" />
          <span>常用片段</span>
        </div>
        {mockItems.filter(item => item.pinned).map(item => (
          <div
            key={item.id}
            className="p-2 mb-1 text-sm bg-blue-50 dark:bg-blue-900/20 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
          >
            {item.preview}
          </div>
        ))}
      </div>

      {/* 历史记录列表 */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
          <Clipboard className="w-3 h-3" />
          <span>最近记录</span>
        </div>
        {mockItems.filter(item => !item.pinned).map(item => (
          <div
            key={item.id}
            className="p-2 mb-1 text-sm border border-gray-200 dark:border-gray-700 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div className="flex items-center justify-between">
              <span className="text-gray-700 dark:text-gray-200 truncate">{item.preview}</span>
              <div className="flex items-center gap-1">
                <button className="p-1 text-gray-400 hover:text-blue-500">
                  <Pin className="w-3 h-3" />
                </button>
                <button className="p-1 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 底部状态栏 */}
      <div className="p-2 text-xs text-gray-400 border-t border-gray-200 dark:border-gray-700 text-center">
        共 {mockItems.length} 条记录
      </div>
    </div>
  );
}

export default App;
