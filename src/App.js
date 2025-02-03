import { useState } from 'react';
import { Pie } from 'react-chartjs-2';
import { TagCloud } from 'react-tagcloud';
import HeatMap from 'react-heatmap-grid';
import { jsPDF } from 'jspdf';
import './App.css';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

// 添加饼图配置
const pieOptions = {
  plugins: {
    legend: {
      display: true,
      position: 'right'
    },
    tooltip: {
      callbacks: {
        label: function(context) {
          const label = context.label || '';
          const value = context.parsed;
          const total = context.dataset.data.reduce((a, b) => a + b, 0);
          const percentage = Math.round((value * 100) / total) + '%';
          return `${label}: ${percentage}`;
        }
      }
    }
  },
  maintainAspectRatio: false,
  responsive: true
};

// 其他工具函数
const parseChatText = (text) => {
  const pattern = /(\S+)\s+(\d{4}[\/-]\d{1,2}[\/-]\d{1,2}\s+\d{1,2}:\d{2})\n([\s\S]+?)(?=\n\S+\s+\d{4}|$)/g;
  const messages = [];
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    const [_, user, timestamp, content] = match;
    if (content.trim()) {
      messages.push({
        user: user.trim(),
        timestamp: new Date(timestamp.replace(/-/g, '/')),
        content: content.trim(),
        hasEmoji: content.includes('[表情]')
      });
    }
  }
  return messages;
};

const calculateUserStats = (messages) => {
  const userCounts = messages.reduce((acc, { user }) => {
    acc[user] = (acc[user] || 0) + 1;
    return acc;
  }, {});

  return {
    labels: Object.keys(userCounts),
    datasets: [{
      data: Object.values(userCounts),
      backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
    }]
  };
};

// 扩展停用词列表，添加常见英文停用词
const stopWords = new Set([
  '的', '是', '在', '了', '和', '就', '都', '而', '及', '与', '着', '或', '等', '方面',
  '但', '于', '中', '并', '很', '之', '他', '她', '它', '你', '我', '也', '这', '那',
  '有', '被', '么', '为', '以', '所', '如', '要', '可以', '能', '会', '吧', '啊', '呢',
  '吗', '还', '只', '就是', '什么', '那么', '这么', '怎么', '一个', '没有', '因为', '所以',
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'up', 'about', 'into', 'over', 'after'
]);

// 添加重复字符的标准化函数
const standardizeRepeatedChars = (word) => {
  // 处理连续重复的中文字符
  if (/^[\u4e00-\u9fa5]+$/.test(word)) {
    const chars = Array.from(word);
    let result = chars[0] || '';
    for (let i = 1; i < chars.length; i++) {
      if (chars[i] !== chars[i-1]) {
        result += chars[i];
      }
    }
    // 如果标准化后只剩一个字符，则保留两个
    if (result.length === 1 && word.length > 1) {
      result = result.repeat(2);
    }
    return result;
  }
  return word;
};

// 修改词云生成函数
const generateWordCloud = (messages) => {
  // 收集所有有效的词语
  const words = messages.flatMap(msg => {
    // 如果消息中包含[链接]，跳过整个消息内容
    if (msg.content.includes('[链接]')) {
      return [];
    }
    
    // 移除所有中括号内容
    const cleanContent = msg.content.replace(/\[.*?\]/g, '');
    
    // 分词结果数组
    const allWords = [];
    
    // 提取英文词语（包括带数字的词语）
    const englishWords = cleanContent.match(/[a-zA-Z0-9]+/g) || [];
    allWords.push(...englishWords);
    
    // 提取中文词语
    const chineseContent = cleanContent.replace(/[a-zA-Z0-9]+/g, ' ');
    for (let i = 0; i < chineseContent.length - 1; i++) {
      for (let len = 2; len <= 4 && i + len <= chineseContent.length; len++) {
        const word = chineseContent.slice(i, i + len).trim();
        if (word && /^[\u4e00-\u9fa5]+$/.test(word)) {
          allWords.push(word);
        }
      }
    }
    
    return allWords;
  });

  // 标准化并统计词频
  const wordCount = words.reduce((acc, word) => {
    // 转换为小写并标准化
    const normalizedWord = standardizeRepeatedChars(word.toLowerCase());
    if (!stopWords.has(normalizedWord) && normalizedWord.length > 1) {
      acc[normalizedWord] = (acc[normalizedWord] || 0) + 1;
    }
    return acc;
  }, {});

  // 转换为数组并排序
  const sortedWords = Object.entries(wordCount)
    .filter(([_, count]) => count > 1) // 只保留出现多次的词
    .sort((a, b) => b[1] - a[1]) // 按频率降序排序
    .slice(0, 5) // 只取前5个
    .map(([text, count]) => ({
      value: text,
      count: count,
      text: `${text} (${count}次)`
    }));

  return sortedWords;
};

const generateTimeHeatmap = (messages) => {
  const dateGroups = messages.reduce((acc, msg) => {
    const date = msg.timestamp.toISOString().split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {});

  const mostActiveDate = Object.entries(dateGroups)
    .sort((a, b) => b[1].length - a[1].length)[0][0];

  const timeSlots = Array.from({ length: 48 }, (_, i) => {
    const hour = Math.floor(i / 2);
    const minute = i % 2 === 0 ? '00' : '30';
    return `${hour.toString().padStart(2, '0')}:${minute}`;
  });

  const halfHourCounts = new Array(48).fill(0);
  messages.forEach(({ timestamp }) => {
    const hour = timestamp.getHours();
    const minute = timestamp.getMinutes();
    const slotIndex = hour * 2 + (minute >= 30 ? 1 : 0);
    halfHourCounts[slotIndex]++;
  });

  let maxCount = 0;
  let mostActiveSlot = 0;
  halfHourCounts.forEach((count, index) => {
    if (count > maxCount) {
      maxCount = count;
      mostActiveSlot = index;
    }
  });

  const mostActiveTimeSlot = `${timeSlots[mostActiveSlot]}-${timeSlots[mostActiveSlot + 1] || '00:00'}`;

  return {
    mostActiveDate,
    mostActiveTimeSlot,
    data: halfHourCounts
  };
};

const findPersonalPhrases = (messages) => {
  const userPhrases = {};
  messages.forEach(({ user, content }) => {
    // 如果消息包含[链接]，跳过整个消息
    if (content.includes('[链接]')) {
      return;
    }

    if (!userPhrases[user]) userPhrases[user] = {};
    
    // 过滤掉所有中括号内的内容
    const filteredContent = content.replace(/\[.*?\]/g, '');
    
    filteredContent.split(' ').forEach(word => {
      if (word.length > 1) {
        userPhrases[user][word] = (userPhrases[user][word] || 0) + 1;
      }
    });
  });

  const result = {};
  Object.entries(userPhrases).forEach(([user, words]) => {
    const sorted = Object.entries(words)
      .filter(([word]) => word.trim().length > 0) // 确保不包含空字符串
      .sort((a, b) => b[1] - a[1]);
    result[user] = sorted.slice(0, 3).map(([word]) => word);
  });

  return result;
};

const readUploadedFile = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsText(file);
  });
};

function App() {
  const [chatText, setChatText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysisResults, setAnalysisResults] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file.name.endsWith('.txt') && !file.name.endsWith('.docx')) {
      setError('请上传.txt或.docx格式的文件');
      return;
    }
    setFile(file);
  };

  const analyzeChatData = async () => {
    setLoading(true);
    try {
      let fullText = chatText;
      
      if (file) {
        const fileContent = await readUploadedFile(file);
        fullText += '\n' + fileContent;
      }
  
      const messages = parseChatText(fullText);
      
      if (messages.length === 0) {
        throw new Error('无法识别聊天记录格式');
      }

      const results = {
        userStats: calculateUserStats(messages),
        wordCloud: generateWordCloud(messages),
        timeHeatmap: generateTimeHeatmap(messages),
        personalPhrases: findPersonalPhrases(messages)
      };

      setAnalysisResults(results);
    } catch (error) {
      setError('分析过程出错，请重试');
    }
    setLoading(false);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('微信群聊分析报告', 15, 20);
    
    const pieCanvas = document.querySelector('.chart canvas');
    if (pieCanvas) {
      const pieImg = pieCanvas.toDataURL('image/png');
      doc.addImage(pieImg, 'PNG', 15, 30, 80, 60);
    }
    
    doc.save('chat-analysis.pdf');
  };

  return (
    <div className="App">
          <header className="app-header">
      <h1>微信聊天记录分析助手</h1>
    </header>
    <div className="analysis-container"></div>
      <div className="analysis-container">
        <div className="input-section">
          <input type="file" accept=".txt,.docx" onChange={handleFileUpload} />
          <textarea
            placeholder="将聊天记录粘贴到这里..."
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
          />
          <button onClick={analyzeChatData} disabled={loading}>
            {loading ? '分析中...' : '开始分析'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {analysisResults && (
          <div className="results-section">
            <div className="chart">
              <h3>成员发言占比</h3>
              <div style={{ flex: 1, position: 'relative' }}>
                <Pie data={analysisResults.userStats} options={pieOptions} />
              </div>
            </div>
            
            <div className="chart">
              <h3>高频词语</h3>
              <div className="word-cloud">
                {analysisResults.wordCloud.map((item, index) => (
                  <div key={index} className="word-item">
                    <span className="word-rank">{index + 1}.</span>
                    <span className="word-text">{item.value}</span>
                    <span className="word-count">{item.count}次</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="chart">
              <h3>活跃度分析</h3>
              <div className="activity-stats">
                <p>最活跃日期: {analysisResults.timeHeatmap.mostActiveDate}</p>
                <p>最活跃时段: {analysisResults.timeHeatmap.mostActiveTimeSlot}</p>
              </div>
            </div>

            <div className="chart">
              <h3>个性化口头禅</h3>
              <div style={{ overflowY: 'auto' }}>
                {Object.entries(analysisResults.personalPhrases).map(([user, phrases]) => (
                  <div key={user}>
                    <h4>{user}</h4>
                    <ul>
                      {phrases.map((phrase, i) => (
                        <li key={i}>{phrase}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <button 
              onClick={exportToPDF} 
              className="export-button"
            >
              导出PDF报告
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;