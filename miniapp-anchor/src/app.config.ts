export default defineAppConfig({
  /**
   * 主包：仅 Tab + 登录门禁 + 协议（压源码包 ≤2MB）
   * 二级页全部进 subPackages，navigateTo 路径不变
   */
  pages: [
    'pages/index/index',
    'pages/legal/index',
    'pages/home/index',
    'pages/community/index',
    'pages/messages/index',
    'pages/mine/index',
    'pages/activate/index',
  ],
  subPackages: [
    {
      root: 'pages/activities',
      pages: ['index'],
    },
    {
      root: 'pages/training',
      pages: ['index'],
    },
    {
      root: 'pages/records',
      pages: ['index'],
    },
    {
      root: 'pages/activity-records',
      pages: ['index'],
    },
    {
      root: 'pages/submit',
      pages: ['index'],
    },
    {
      root: 'pages/record-detail',
      pages: ['index'],
    },
    {
      root: 'pages/onboarding',
      pages: ['index'],
    },
    {
      root: 'pages/reviews',
      pages: ['index'],
    },
    {
      root: 'pages/learned',
      pages: ['index'],
    },
    {
      root: 'pages/homework-detail',
      pages: ['index'],
    },
    {
      root: 'pages/qa',
      pages: ['index'],
    },
    {
      root: 'pages/feedback',
      pages: ['index'],
    },
    {
      root: 'pages/leaderboard',
      pages: ['index'],
    },
    {
      root: 'pages/diy-land',
      pages: ['index'],
    },
    {
      root: 'pages/diy-preview',
      pages: ['index'],
    },
    {
      root: 'pages/community/compose',
      pages: ['index'],
    },
    {
      root: 'pages/community/detail',
      pages: ['index'],
    },
    {
      root: 'pages/community/mine',
      pages: ['index'],
    },
    {
      root: 'pages/community/profile',
      pages: ['index'],
    },
    {
      root: 'pages/community/cover-crop',
      pages: ['index'],
    },
    {
      root: 'pages/community/video-preview',
      pages: ['index'],
    },
  ],
  // 预下载：进社区 Tab 时预拉社区分包（可选，体积仍不计入主包预览限制）
  preloadRule: {
    'pages/community/index': {
      network: 'all',
      packages: [
        'pages/community/compose',
        'pages/community/profile',
        'pages/community/detail',
      ],
    },
    'pages/home/index': {
      network: 'wifi',
      packages: ['pages/activities', 'pages/training'],
    },
  },
  window: {
    backgroundTextStyle: 'dark',
    backgroundColor: '#f7f8fa',
    navigationBarBackgroundColor: '#7EA3E0',
    navigationBarTitleText: '悦动芳草地',
    navigationBarTextStyle: 'black',
  },
  networkTimeout: {
    request: 30000,
    connectSocket: 20000,
    uploadFile: 120000,
    downloadFile: 60000,
  },
  lazyCodeLoading: 'requiredComponents',
  resizable: true,
  tabBar: {
    /** 与 assets/tabbar 图标套色一致（xxxxx/tabbar/1） */
    color: '#1E3C5A',
    selectedColor: '#3A8CE8',
    backgroundColor: '#FFFFFF',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页',
        iconPath: 'assets/tabbar/home.png',
        selectedIconPath: 'assets/tabbar/home-selected.png',
      },
      {
        pagePath: 'pages/community/index',
        text: '圈子',
        iconPath: 'assets/tabbar/circle.png',
        selectedIconPath: 'assets/tabbar/circle-selected.png',
      },
      {
        pagePath: 'pages/messages/index',
        text: '消息',
        iconPath: 'assets/tabbar/messages.png',
        selectedIconPath: 'assets/tabbar/messages-selected.png',
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的',
        iconPath: 'assets/tabbar/mine.png',
        selectedIconPath: 'assets/tabbar/mine-selected.png',
      },
    ],
  },
})
