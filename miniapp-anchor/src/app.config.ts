export default defineAppConfig({
  pages: [
    'pages/activate/index',
    'pages/activities/index',
    'pages/records/index',
    'pages/mine/index',
    'pages/activity-records/index',
    'pages/submit/index',
    'pages/record-detail/index',
  ],
  window: {
    backgroundTextStyle: 'dark',
    backgroundColor: '#f4f8f3',
    navigationBarBackgroundColor: '#f4f8f3',
    navigationBarTitleText: '悦总统',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#8B9590',
    selectedColor: '#3A8E52',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/activities/index',
        text: '活动',
        iconPath: 'assets/tabbar/activities.png',
        selectedIconPath: 'assets/tabbar/activities-selected.png',
      },
      {
        pagePath: 'pages/records/index',
        text: '记录',
        iconPath: 'assets/tabbar/records.png',
        selectedIconPath: 'assets/tabbar/records-selected.png',
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
