/**
 * plugins/withSceneLifecycle.js
 *
 * iOS 27 SDK: UIKit refuses to launch apps that don't adopt the UIScene life
 * cycle (crash in __UIApplicationEvaluateRuntimeIssues → EXC_BREAKPOINT in
 * main.m, console: "...adopt the scene-based life cycle..."). React Native
 * 0.74 / Expo SDK 51 predate this and create their window the old way.
 *
 * This plugin keeps the existing AppDelegate (which still builds the React
 * Native window in didFinishLaunching) and adds a minimal SceneDelegate that
 * attaches that window to the scene UIKit creates. It also forwards deep
 * links and window-size changes, which UIKit now delivers to the scene.
 *
 * Idempotent: safe across repeated `expo prebuild` runs.
 */
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const MARKER = '// @abhicabs scene-lifecycle';

const SCENE_DELEGATE = `
${MARKER} begin
#pragma mark - UIScene life cycle (required by the iOS 27 SDK)

@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property (nonatomic, strong) UIWindow *window;
@end

@implementation SceneDelegate

- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }
  UIWindowScene *windowScene = (UIWindowScene *)scene;
  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;

  // RCTAppDelegate already built the React root view controller in
  // application:didFinishLaunchingWithOptions: on a window that has no scene.
  // Build a proper scene-backed window and move that controller onto it.
  UIWindow *oldWindow = appDelegate.window;
  UIViewController *rootViewController = oldWindow.rootViewController;
  oldWindow.rootViewController = nil;
  oldWindow.hidden = YES;

  UIWindow *window = [[UIWindow alloc] initWithWindowScene:windowScene];
  window.rootViewController = rootViewController ?: [UIViewController new];
  appDelegate.window = window;
  self.window = window;
  [window makeKeyAndVisible];

  // Deep link that launched the app (cold start).
  if (connectionOptions.URLContexts.count > 0) {
    [self scene:scene openURLContexts:connectionOptions.URLContexts];
  }
  if (connectionOptions.userActivities.count > 0) {
    NSUserActivity *activity = connectionOptions.userActivities.anyObject;
    [RCTLinkingManager application:UIApplication.sharedApplication
              continueUserActivity:activity
                restorationHandler:^(NSArray *_) {}];
  }
}

- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts
{
  for (UIOpenURLContext *context in URLContexts) {
    [RCTLinkingManager application:UIApplication.sharedApplication openURL:context.URL options:@{}];
  }
}

- (void)scene:(UIScene *)scene continueUserActivity:(NSUserActivity *)userActivity
{
  [RCTLinkingManager application:UIApplication.sharedApplication
            continueUserActivity:userActivity
              restorationHandler:^(NSArray *_) {}];
}

// Rotation / resize → React Native's Dimensions (RCTAppDelegate did this
// when it was the scene delegate).
- (void)windowScene:(UIWindowScene *)windowScene
    didUpdateCoordinateSpace:(id<UICoordinateSpace>)previousCoordinateSpace
        interfaceOrientation:(UIInterfaceOrientation)previousInterfaceOrientation
             traitCollection:(UITraitCollection *)previousTraitCollection
{
  [[NSNotificationCenter defaultCenter] postNotificationName:RCTWindowFrameDidChangeNotification
                                                      object:UIApplication.sharedApplication.delegate];
}

@end
${MARKER} end
`;

function addSceneDelegate(src) {
  if (src.includes(MARKER)) return src;
  let out = src;
  if (!out.includes('#import <React/RCTConstants.h>')) {
    out = out.replace('#import <React/RCTLinkingManager.h>', '#import <React/RCTLinkingManager.h>\n#import <React/RCTConstants.h>');
  }
  return `${out.trimEnd()}\n${SCENE_DELEGATE}`;
}

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });
  config = withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'objcpp' && cfg.modResults.language !== 'objc') {
      throw new Error('withSceneLifecycle: expected an Objective-C AppDelegate');
    }
    cfg.modResults.contents = addSceneDelegate(cfg.modResults.contents);
    return cfg;
  });
  return config;
};

module.exports.addSceneDelegate = addSceneDelegate;
