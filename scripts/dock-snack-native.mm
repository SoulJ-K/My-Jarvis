// Node-API only: loaded in Electron MAIN, never in a renderer or child process.
// No filesystem/URL/file promises, global monitor, event posting or permissions.
#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#include <node_api.h>
#include <atomic>
#include <cmath>
#include <cstring>
#include <memory>
#include <string>

static constexpr size_t kMaxJSON = 800000;
static constexpr uint64_t kMaxToken = 9007199254740991ULL;

// Pure screen geometry: AppKit cursor coordinates are bottom-left based;
// the screenshot hotspot is top-left based. No backing-scale conversion.
static bool OverlayFrame(NSPoint cursor, NSSize size, NSPoint hotspot, NSRect *out) {
  if (!out || !std::isfinite(cursor.x) || !std::isfinite(cursor.y)
      || !std::isfinite(size.width) || !std::isfinite(size.height)
      || !std::isfinite(hotspot.x) || !std::isfinite(hotspot.y)
      || size.width<=0 || size.height<=0 || hotspot.x<0 || hotspot.x>size.width
      || hotspot.y<0 || hotspot.y>size.height) return false;
  NSRect frame=NSMakeRect(cursor.x-hotspot.x,cursor.y-(size.height-hotspot.y),size.width,size.height);
  if (!std::isfinite(frame.origin.x) || !std::isfinite(frame.origin.y)) return false;
  *out=frame;
  return true;
}

@interface DockGhostPanel : NSPanel
@end
@implementation DockGhostPanel
- (BOOL)canBecomeKeyWindow { return NO; }
- (BOOL)canBecomeMainWindow { return NO; }
@end

static bool Number(NSDictionary *d, NSString *key, double min, double max, double *out) {
  id v = d[key];
  if (![v isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)v) == CFBooleanGetTypeID()) return false;
  double n = [v doubleValue];
  if (!std::isfinite(n) || n < min || n > max) return false;
  *out = n; return true;
}

// Pure validation: no NSApplication, NSWindow, NSImage, monitor or pasteboard.
static NSDictionary *ValidateRequest(NSData *json, NSData **imageBytes) {
  if (!json || json.length > kMaxJSON) return nil;
  id decoded = [NSJSONSerialization JSONObjectWithData:json options:0 error:nil];
  if (![decoded isKindOfClass:NSDictionary.class]) return nil;
  NSDictionary *d = decoded;
  NSSet *keys = [NSSet setWithArray:@[@"protocolVersion", @"requestId", @"imagePNGBase64", @"width", @"height", @"hotSpotX", @"hotSpotY"]];
  if (d.count != keys.count || ![[NSSet setWithArray:d.allKeys] isEqualToSet:keys]) return nil;
  double version, width, height, hotX, hotY;
  if (!Number(d,@"protocolVersion",1,1,&version) || !Number(d,@"width",1,1024,&width)
      || !Number(d,@"height",1,1024,&height) || !Number(d,@"hotSpotX",0,width,&hotX)
      || !Number(d,@"hotSpotY",0,height,&hotY)) return nil;
  NSString *requestId = d[@"requestId"], *base64 = d[@"imagePNGBase64"];
  if (![requestId isKindOfClass:NSString.class] || requestId.length > 80
      || [requestId rangeOfString:@"^[A-Za-z0-9-]{1,80}$" options:NSRegularExpressionSearch].location == NSNotFound
      || ![base64 isKindOfClass:NSString.class] || base64.length > 700000) return nil;
  NSData *png = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  if (png.length < 24 || png.length > 512000) return nil;
  const uint8_t signature[8] = {137,80,78,71,13,10,26,10};
  const uint8_t *p = (const uint8_t *)png.bytes;
  if (memcmp(p,signature,8) || memcmp(p+12,"IHDR",4)) return nil;
  uint32_t w=0,h=0;
  for (int i=0;i<4;i++) { w=(w<<8)|p[16+i]; h=(h<<8)|p[20+i]; }
  if (!w || !h || w>2048 || h>2048) return nil;
  if (imageBytes) *imageBytes=png;
  return d;
}

struct CallbackGate { std::atomic<bool> permitted{true}; std::atomic<bool> finalized{false}; };
using Gate = std::shared_ptr<CallbackGate>;
static void FinalizeCallback(napi_env, void *data, void *) {
  Gate *holder=static_cast<Gate *>(data);
  (*holder)->permitted=false; (*holder)->finalized=true;
  delete holder;
}
static void CallJS(napi_env env, napi_value callback, void *context, void *data) {
  std::unique_ptr<std::string> message(static_cast<std::string *>(data));
  Gate *gate = static_cast<Gate *>(context);
  if (!env || !callback || !gate || !(*gate)->permitted.load()) return;
  napi_value argument, receiver, ignored;
  if (napi_create_string_utf8(env,message->data(),message->size(),&argument) != napi_ok
      || napi_get_undefined(env,&receiver) != napi_ok) return;
  // Never invoke JS synchronously from an AppKit delegate / tracking loop.
  if (napi_call_function(env,receiver,callback,1,&argument,&ignored)!=napi_ok) {
    (*gate)->permitted=false;
    bool pending=false;
    if (napi_is_exception_pending(env,&pending)==napi_ok && pending) {
      napi_value exception; napi_get_and_clear_last_exception(env,&exception);
    }
  }
}

@class DockAttachment;
static __weak DockAttachment *gActiveDrag = nil;
struct Environment {
  __strong NSMutableDictionary<NSNumber *,DockAttachment *> *attachments;
  uint64_t nextToken=1;
  bool closing=false;
};

@interface DockAttachment : NSObject <NSDraggingSource> {
@public
  napi_threadsafe_function channel;
  Gate gate;
}
@property(nonatomic,weak) NSView *attachedView;
@property(nonatomic,weak) NSWindow *window;
@property(nonatomic,weak) NSView *sourceView;
// The observed view is weak while idle. Retain the actual source only for the
// OS drag lifetime so closing/detaching the window cannot deallocate it mid-drag.
@property(nonatomic,strong) NSView *activeSourceView;
@property(nonatomic,strong) NSEvent *mouseDown;
@property(nonatomic,strong) id monitor;
@property(nonatomic,strong) id closeObserver;
@property(nonatomic,strong) NSTimer *watchdog;
@property(nonatomic,strong) DockAttachment *keepAlive;
@property(nonatomic,strong) NSString *requestId;
@property(nonatomic,strong) DockGhostPanel *overlay;
@property(nonatomic) NSSize logicalSize;
@property(nonatomic) NSPoint hotspot;
@property(nonatomic) BOOL active;
@property(nonatomic) BOOL trackingBegan;
@property(nonatomic) BOOL disposed;
@property(nonatomic) BOOL alphaChanged;
@property(nonatomic) CGFloat originalAlpha;
@property(nonatomic) NSUInteger moves;
@property(nonatomic) NSUInteger externalQueries;
@property(nonatomic) NSUInteger localQueries;
@property(nonatomic) NSTimeInterval startedAt;
- (void)install;
- (BOOL)openChannel:(napi_env)env callback:(napi_value)callback;
- (void)send:(NSString *)event fields:(NSDictionary *)fields;
- (void)finishChannel;
- (void)restoreAlpha;
- (BOOL)positionOverlay:(NSDraggingSession *)session;
- (void)cancelAuthority;
- (void)detach;
- (void)fail:(NSString *)reason;
- (void)startRequest:(NSDictionary *)request image:(NSData *)bytes;
@end

@implementation DockAttachment
- (void)install {
  __weak DockAttachment *weakSelf=self;
  self.monitor=[NSEvent addLocalMonitorForEventsMatchingMask:(NSEventMaskLeftMouseDown|NSEventMaskLeftMouseUp)
    handler:^NSEvent *(NSEvent *event) {
      DockAttachment *self=weakSelf;
      if (!self || self.disposed || self.active) return event;
      // Only this app's real delivered events. Never consume or synthesize them.
      if (event.type==NSEventTypeLeftMouseUp) { self.mouseDown=nil; self.sourceView=nil; return event; }
      self.mouseDown=nil; self.sourceView=nil;
      NSView *root=self.attachedView;
      if (!root || event.window!=self.window || root.window!=self.window) return event;
      NSPoint point=root.superview ? [root.superview convertPoint:event.locationInWindow fromView:nil] : event.locationInWindow;
      NSView *hit=[root hitTest:point];
      if (hit && (hit==root || [hit isDescendantOf:root])) {
        self.mouseDown=event; self.sourceView=hit;
      }
      return event;
    }];
  self.closeObserver=[[NSNotificationCenter defaultCenter] addObserverForName:NSWindowWillCloseNotification
    object:self.window queue:nil usingBlock:^(__unused NSNotification *notification) { [weakSelf detach]; }];
}
- (BOOL)openChannel:(napi_env)env callback:(napi_value)callback {
  if (gate) gate->permitted=false;
  gate=std::make_shared<CallbackGate>();
  Gate *holder=new Gate(gate);
  napi_value name;
  if (napi_create_string_utf8(env,"JarvisDockNative",NAPI_AUTO_LENGTH,&name)!=napi_ok) { delete holder; return NO; }
  napi_status status=napi_create_threadsafe_function(env,callback,nullptr,name,16,1,holder,FinalizeCallback,
    holder,CallJS,&channel);
  if (status!=napi_ok) { channel=nullptr; delete holder; return NO; }
  // App lifetime, not an unfinished drag, owns the process's ability to exit.
  napi_unref_threadsafe_function(env,channel);
  return YES;
}
- (void)send:(NSString *)event fields:(NSDictionary *)fields {
  if (!channel || !gate || gate->finalized.load() || !gate->permitted.load()) return;
  NSMutableDictionary *body=[fields mutableCopy];
  body[@"protocolVersion"]=@1; body[@"requestId"]=self.requestId; body[@"event"]=event;
  NSData *json=[NSJSONSerialization dataWithJSONObject:body options:0 error:nil];
  if (!json) return;
  std::string *message=new std::string((const char *)json.bytes,json.length);
  if (napi_call_threadsafe_function(channel,message,napi_tsfn_nonblocking)!=napi_ok) delete message;
}
- (void)finishChannel {
  if (channel && gate && !gate->finalized.load()) napi_release_threadsafe_function(channel,napi_tsfn_release);
  channel=nullptr;
}
- (void)restoreAlpha {
  DockGhostPanel *overlay=self.overlay;
  self.overlay=nil;
  @try { [overlay orderOut:nil]; [overlay close]; }
  @catch (__unused NSException *error) { /* Continue restoring the real source. */ }
  if (!self.alphaChanged) return;
  self.alphaChanged=NO;
  @try { if (self.window) self.window.alphaValue=self.originalAlpha; }
  @catch (__unused NSException *error) { /* Closing window; never touch another window. */ }
}
- (BOOL)positionOverlay:(NSDraggingSession *)session {
  if (!self.overlay || !self.active || self.disposed || !gate || !gate->permitted.load() || !channel) return NO;
  NSRect frame;
  if (!OverlayFrame(session.draggingLocation,self.logicalSize,self.hotspot,&frame)) return NO;
  // Only move: the panel and image view retain the requested logical size.
  [self.overlay setFrameOrigin:frame.origin];
  return YES;
}
- (void)cancelAuthority {
  // There is no public NSDraggingSession cancellation API. Revoke this callback
  // and restore the original window; do not post Escape/mouse-up or claim that
  // the OS tracking session ended. Keep the source alive until real completion.
  if (gate) gate->permitted=false;
  if (channel && gate && !gate->finalized.load()) napi_release_threadsafe_function(channel,napi_tsfn_abort);
  channel=nullptr;
  [self.watchdog invalidate]; self.watchdog=nil;
  [self restoreAlpha];
  self.mouseDown=nil;
  if (!self.active) self.sourceView=nil;
}
- (void)detach {
  if (self.disposed) return;
  self.disposed=YES;
  [self cancelAuthority];
  if (self.monitor) { [NSEvent removeMonitor:self.monitor]; self.monitor=nil; }
  if (self.closeObserver) { [[NSNotificationCenter defaultCenter] removeObserver:self.closeObserver]; self.closeObserver=nil; }
}
- (void)fail:(NSString *)reason {
  [self restoreAlpha];
  [self.watchdog invalidate]; self.watchdog=nil;
  [self send:@"failed" fields:@{@"reason":reason}];
  [self finishChannel];
}
- (void)startRequest:(NSDictionary *)request image:(NSData *)bytes {
  self.requestId=request[@"requestId"];
  if (self.disposed || !self.attachedView || !self.window || self.attachedView.window!=self.window) { [self fail:@"source-unavailable"]; return; }
  if (self.active || gActiveDrag) { [self fail:@"drag-busy"]; return; }
  NSEvent *event=self.mouseDown;
  NSView *source=self.sourceView;
  if (!event || !source || event.type!=NSEventTypeLeftMouseDown || event.window!=self.window || source.window!=self.window) {
    [self fail:@"missing-mouse-down"]; return;
  }
  if (!(NSEvent.pressedMouseButtons&1)) { [self fail:@"button-released"]; return; }
  const double age=NSProcessInfo.processInfo.systemUptime-event.timestamp;
  if (age<0 || age>60) { [self fail:@"stale-mouse-down"]; return; }
  NSImage *image=[[NSImage alloc] initWithData:bytes];
  if (!image || image.representations.count==0) { [self fail:@"invalid-image"]; return; }
  const NSSize logicalSize=NSMakeSize([request[@"width"] doubleValue],[request[@"height"] doubleValue]);
  image.size=logicalSize;
  // Retina bitmap pixel sizes stay intact; all logical representation sizes
  // match the main-process DIP screenshot dimensions, preventing half-size art.
  for (NSImageRep *representation in image.representations) representation.size=logicalSize;
  const NSPoint down=[source convertPoint:event.locationInWindow fromView:nil];
  const double hotX=[request[@"hotSpotX"] doubleValue],hotY=[request[@"hotSpotY"] doubleValue];
  const NSRect frame=NSMakeRect(down.x-hotX,down.y-(source.isFlipped?hotY:logicalSize.height-hotY),logicalSize.width,logicalSize.height);
  NSPasteboardItem *item=[NSPasteboardItem new];
  [item setString:@"snack" forType:@"local.jarvispet.snack-request"];
  [item setString:@"Jarvis Pet snack request" forType:NSPasteboardTypeString];
  NSDraggingItem *dragItem=[[NSDraggingItem alloc] initWithPasteboardWriter:item];
  // AppKit explicitly supports nil contents to hide the native drag image.
  // The real source still owns the OS session and its destination operation.
  [dragItem setDraggingFrame:frame contents:nil];
  dragItem.imageComponentsProvider=nil;
  self.logicalSize=logicalSize;
  self.hotspot=NSMakePoint(hotX,hotY);
  self.overlay=[[DockGhostPanel alloc] initWithContentRect:NSMakeRect(0,0,logicalSize.width,logicalSize.height)
    styleMask:(NSWindowStyleMaskBorderless|NSWindowStyleMaskNonactivatingPanel)
    backing:NSBackingStoreBuffered defer:NO];
  if (!self.overlay) { [self fail:@"native-start-failed"]; return; }
  self.overlay.releasedWhenClosed=NO;
  self.overlay.opaque=NO;
  self.overlay.backgroundColor=NSColor.clearColor;
  self.overlay.hasShadow=NO;
  self.overlay.ignoresMouseEvents=YES;
  self.overlay.hidesOnDeactivate=NO;
  self.overlay.level=NSStatusWindowLevel;
  self.overlay.collectionBehavior=NSWindowCollectionBehaviorCanJoinAllSpaces
    |NSWindowCollectionBehaviorFullScreenAuxiliary|NSWindowCollectionBehaviorIgnoresCycle;
  NSImageView *imageView=[[NSImageView alloc] initWithFrame:NSMakeRect(0,0,logicalSize.width,logicalSize.height)];
  imageView.imageScaling=NSImageScaleNone;
  imageView.imageAlignment=NSImageAlignCenter;
  imageView.image=image;
  self.overlay.contentView=imageView;
  self.moves=0; self.externalQueries=0; self.localQueries=0;
  self.trackingBegan=NO;
  self.startedAt=NSProcessInfo.processInfo.systemUptime;
  self.originalAlpha=self.window.alphaValue;
  self.active=YES; self.activeSourceView=source; self.keepAlive=self; gActiveDrag=self;
  self.mouseDown=nil; // One actual mouse-down can authorize only one start.
  [self send:@"diagnostic" fields:@{@"code":@"in-process-native-v4"}];
  __weak DockAttachment *weakSelf=self;
  self.watchdog=[NSTimer timerWithTimeInterval:45 repeats:NO block:^(__unused NSTimer *timer) {
    DockAttachment *self=weakSelf;
    if (self.active) [self fail:@"timeout"];
  }];
  [[NSRunLoop mainRunLoop] addTimer:self.watchdog forMode:NSRunLoopCommonModes];
  [[NSRunLoop mainRunLoop] addTimer:self.watchdog forMode:NSEventTrackingRunLoopMode];
  @try {
    NSDraggingSession *session=[source beginDraggingSessionWithItems:@[dragItem] event:event source:self];
    if (session) session.animatesToStartingPositionsOnCancelOrFail=NO;
    else { self.active=NO; self.activeSourceView=nil; self.keepAlive=nil; if (gActiveDrag==self) gActiveDrag=nil; [self fail:@"native-start-failed"]; }
  } @catch (__unused NSException *error) {
    if (!self.trackingBegan) {
      self.active=NO; self.activeSourceView=nil; self.keepAlive=nil; if (gActiveDrag==self) gActiveDrag=nil;
    }
    [self fail:@"native-exception"];
  }
}
- (NSDragOperation)draggingSession:(NSDraggingSession *)session sourceOperationMaskForDraggingContext:(NSDraggingContext)context {
  if (context==NSDraggingContextOutsideApplication) self.externalQueries=MIN(100000,self.externalQueries+1);
  else self.localQueries=MIN(100000,self.localQueries+1);
  // Revocation cannot stop OS tracking, but no destination action remains allowed.
  return !self.disposed && gate && gate->permitted.load() && channel
    && context==NSDraggingContextOutsideApplication ? NSDragOperationDelete : NSDragOperationNone;
}
- (BOOL)ignoreModifierKeysForDraggingSession:(NSDraggingSession *)session { return YES; }
- (void)draggingSession:(NSDraggingSession *)session willBeginAtPoint:(NSPoint)point {
  if (!self.active || self.disposed || !gate || !gate->permitted.load() || !channel) return;
  self.trackingBegan=YES;
  @try {
    session.animatesToStartingPositionsOnCancelOrFail=NO;
    if (![self positionOverlay:session]) { [self fail:@"native-exception"]; return; }
    self.alphaChanged=YES;
    self.window.alphaValue=0; // Never hide/orderOut the source or change its mouse capture.
    [self.overlay orderFrontRegardless]; // Nonactivating, never key or main.
    [self send:@"started" fields:@{}];
  } @catch (__unused NSException *error) { [self fail:@"native-exception"]; }
}
- (void)draggingSession:(NSDraggingSession *)session movedToPoint:(NSPoint)point {
  self.moves=MIN(100000,self.moves+1);
  if (!self.trackingBegan || !self.overlay) return;
  @try {
    if (![self positionOverlay:session]) [self fail:@"native-exception"];
  } @catch (__unused NSException *error) { [self fail:@"native-exception"]; }
}
- (void)draggingSession:(NSDraggingSession *)session endedAtPoint:(NSPoint)point operation:(NSDragOperation)operation {
  // Hold a local reference before releasing the cycle used to survive dispose.
  DockAttachment *strongSelf=self;
  [strongSelf restoreAlpha];
  [self.watchdog invalidate]; self.watchdog=nil;
  double elapsed=MAX(0,MIN(60000,(NSProcessInfo.processInfo.systemUptime-self.startedAt)*1000));
  [self send:@"diagnostic" fields:@{@"code":@"drag-summary",@"durationMs":@((int)llround(elapsed)),
    @"moves":@(self.moves),@"externalMaskQueries":@(self.externalQueries),@"localMaskQueries":@(self.localQueries),
    @"endedWhileButtonDown":@((NSEvent.pressedMouseButtons&1)!=0),@"operationRaw":@((uint32_t)MIN((NSUInteger)UINT32_MAX,operation))}];
  CGFloat primaryTop=NSScreen.screens.firstObject.frame.size.height+NSScreen.screens.firstObject.frame.origin.y;
  [self send:@"ended" fields:@{@"operation":operation==NSDragOperationDelete?@"delete":@"none",
    @"screenPoint":@{@"x":@(point.x),@"y":@(primaryTop-point.y)}}];
  [self finishChannel];
  self.active=NO; self.sourceView=nil; self.activeSourceView=nil; if (gActiveDrag==self) gActiveDrag=nil;
  self.keepAlive=nil;
}
@end

static napi_value Undefined(napi_env env) { napi_value value; napi_get_undefined(env,&value); return value; }
static napi_value Error(napi_env env,const char *code) { napi_throw_error(env,code,code); return nullptr; }
static bool MainThread(napi_env env) {
  if (![NSThread isMainThread]) { Error(env,"DOCK_MAIN_THREAD_REQUIRED"); return false; }
  return true;
}
static bool Token(napi_env env,napi_value value,uint64_t *token) {
  napi_valuetype type; double n;
  if (napi_typeof(env,value,&type)!=napi_ok || type!=napi_number || napi_get_value_double(env,value,&n)!=napi_ok
      || !std::isfinite(n) || n<1 || n>kMaxToken || std::floor(n)!=n) return false;
  *token=(uint64_t)n; return true;
}
static NSView *FindView(NSView *known,void *address,NSUInteger *remaining) {
  if (!known || !*remaining) return nil;
  --*remaining;
  if ((__bridge void *)known==address) return known;
  for (NSView *child in known.subviews) { NSView *match=FindView(child,address,remaining); if(match) return match; }
  return nil;
}
static napi_value Attach(napi_env env,napi_callback_info info) {
  if (!MainThread(env)) return nullptr;
  size_t count=2; napi_value args[2]; void *data;
  napi_get_cb_info(env,info,&count,args,nullptr,&data);
  Environment *state=(Environment *)data;
  if (count!=1 || state->closing || !NSApp) return Error(env,"DOCK_APP_REQUIRED");
  bool isBuffer=false; void *bytes=nullptr; size_t length=0;
  if (napi_is_buffer(env,args[0],&isBuffer)!=napi_ok || !isBuffer
      || napi_get_buffer_info(env,args[0],&bytes,&length)!=napi_ok || length!=sizeof(void *)) return Error(env,"DOCK_INVALID_HANDLE");
  void *address=nullptr; memcpy(&address,bytes,sizeof(address));
  // Do not dereference untrusted addresses. Match only views enumerated from
  // this process's known windows, then use that known Objective-C object.
  NSView *view=nil; NSUInteger remaining=4096;
  for (NSWindow *window in NSApp.windows) { view=FindView(window.contentView,address,&remaining); if(view) break; }
  if (!view || !view.window || state->nextToken>kMaxToken) return Error(env,"DOCK_INVALID_HANDLE");
  for (DockAttachment *existing in state->attachments.allValues)
    if (!existing.disposed && existing.window==view.window) return Error(env,"DOCK_ALREADY_ATTACHED");
  DockAttachment *attachment=[DockAttachment new];
  attachment.attachedView=view; attachment.window=view.window;
  @try { [attachment install]; }
  @catch (__unused NSException *error) { [attachment detach]; return Error(env,"DOCK_ATTACH_FAILED"); }
  if (!attachment.monitor) { [attachment detach]; return Error(env,"DOCK_ATTACH_FAILED"); }
  uint64_t token=state->nextToken++; state->attachments[@(token)]=attachment;
  napi_value result; napi_create_double(env,(double)token,&result); return result;
}
static napi_value Start(napi_env env,napi_callback_info info) {
  if (!MainThread(env)) return nullptr;
  size_t count=4; napi_value args[4]; void *data;
  napi_get_cb_info(env,info,&count,args,nullptr,&data);
  Environment *state=(Environment *)data; uint64_t token;
  if (count!=3 || state->closing || !Token(env,args[0],&token)) return Error(env,"DOCK_INVALID_REQUEST");
  DockAttachment *attachment=state->attachments[@(token)];
  if (!attachment || attachment.disposed) return Error(env,"DOCK_INVALID_TOKEN");
  // Do not replace a live session's channel with a second caller's callback.
  if (attachment.active || gActiveDrag) return Error(env,"DOCK_DRAG_BUSY");
  napi_valuetype jsonType,callbackType; size_t length=0;
  napi_typeof(env,args[1],&jsonType); napi_typeof(env,args[2],&callbackType);
  if (jsonType!=napi_string || callbackType!=napi_function
      || napi_get_value_string_utf8(env,args[1],nullptr,0,&length)!=napi_ok || length>kMaxJSON) return Error(env,"DOCK_INVALID_REQUEST");
  std::string json(length+1,'\0'); size_t written;
  if (napi_get_value_string_utf8(env,args[1],json.data(),json.size(),&written)!=napi_ok) return Error(env,"DOCK_INVALID_REQUEST");
  NSData *image=nil;
  NSDictionary *request=ValidateRequest([NSData dataWithBytes:json.data() length:written],&image);
  if (!request) return Error(env,"DOCK_INVALID_REQUEST");
  if (![attachment openChannel:env callback:args[2]]) return Error(env,"DOCK_CALLBACK_FAILED");
  @try { [attachment startRequest:request image:image]; }
  @catch (__unused NSException *error) {
    [attachment restoreAlpha]; [attachment fail:@"native-exception"];
    if (!attachment.trackingBegan) {
      attachment.active=NO; attachment.activeSourceView=nil; attachment.keepAlive=nil;
      if (gActiveDrag==attachment) gActiveDrag=nil;
    }
    // An already-running session stays alive until its real ended callback.
  }
  return Undefined(env);
}
static napi_value Control(napi_env env,napi_callback_info info,bool dispose) {
  if (!MainThread(env)) return nullptr;
  size_t count=2; napi_value args[2]; void *data;
  napi_get_cb_info(env,info,&count,args,nullptr,&data);
  Environment *state=(Environment *)data; uint64_t token;
  if (count!=1 || !Token(env,args[0],&token)) return Error(env,"DOCK_INVALID_TOKEN");
  DockAttachment *attachment=state->attachments[@(token)];
  if (attachment) {
    if (dispose) { [attachment detach]; [state->attachments removeObjectForKey:@(token)]; }
    else [attachment cancelAuthority];
  }
  return Undefined(env);
}
static napi_value Cancel(napi_env env,napi_callback_info info) { return Control(env,info,false); }
static napi_value Dispose(napi_env env,napi_callback_info info) { return Control(env,info,true); }
static napi_value SelfTest(napi_env env,napi_callback_info) {
  @autoreleasepool {
    NSString *png=@"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS0AAAAASUVORK5CYII=";
    NSMutableDictionary *d=[@{@"protocolVersion":@1,@"requestId":@"synthetic",@"imagePNGBase64":png,
      @"width":@420,@"height":@300,@"hotSpotX":@200,@"hotSpotY":@100} mutableCopy];
    auto valid=[&]() {return ValidateRequest([NSJSONSerialization dataWithJSONObject:d options:0 error:nil],nullptr)!=nil;};
    bool passed=valid();
    d[@"hotSpotX"]=@421; passed=passed&&!valid(); d[@"hotSpotX"]=@200;
    d[@"width"]=@YES; passed=passed&&!valid(); d[@"width"]=@420;
    d[@"extra"]=@"forbidden"; passed=passed&&!valid(); [d removeObjectForKey:@"extra"];
    d[@"requestId"]=@"invalid id"; passed=passed&&!valid(); d[@"requestId"]=@"synthetic";
    d[@"protocolVersion"]=@2; passed=passed&&!valid(); d[@"protocolVersion"]=@1;
    NSMutableData *oversized=[[NSData alloc] initWithBase64EncodedString:png options:0].mutableCopy;
    uint8_t *pixels=(uint8_t *)oversized.mutableBytes;
    pixels[16]=0xff; pixels[17]=0xff;
    d[@"imagePNGBase64"]=[oversized base64EncodedStringWithOptions:0]; passed=passed&&!valid();
    d[@"imagePNGBase64"]=@"ZmlsZQ=="; passed=passed&&!valid();
    passed=passed && ValidateRequest([@"[]" dataUsingEncoding:NSUTF8StringEncoding],nullptr)==nil;
    passed=passed&&(NSDragOperationDelete==32);
    NSRect frame;
    passed=passed && OverlayFrame(NSMakePoint(500,600),NSMakeSize(420,300),NSMakePoint(200,100),&frame)
      && NSEqualRects(frame,NSMakeRect(300,400,420,300));
    passed=passed && OverlayFrame(NSMakePoint(-800,-100),NSMakeSize(420,300),NSMakePoint(200,100),&frame)
      && NSEqualRects(frame,NSMakeRect(-1000,-300,420,300));
    passed=passed && OverlayFrame(NSMakePoint(10,20),NSMakeSize(420,300),NSZeroPoint,&frame)
      && NSEqualRects(frame,NSMakeRect(10,-280,420,300));
    passed=passed && OverlayFrame(NSMakePoint(10,20),NSMakeSize(420,300),NSMakePoint(420,300),&frame)
      && NSEqualRects(frame,NSMakeRect(-410,20,420,300));
    passed=passed && !OverlayFrame(NSMakePoint(NAN,20),NSMakeSize(420,300),NSZeroPoint,&frame)
      && !OverlayFrame(NSZeroPoint,NSMakeSize(420,0),NSZeroPoint,&frame)
      && !OverlayFrame(NSZeroPoint,NSMakeSize(420,300),NSMakePoint(421,100),&frame)
      && !OverlayFrame(NSZeroPoint,NSMakeSize(420,300),NSMakePoint(100,-1),&frame);
    napi_value result; napi_get_boolean(env,passed,&result); return result;
  }
}
static void Cleanup(void *data) {
  Environment *state=(Environment *)data; state->closing=true;
  // Attach is main-thread-only, so any state with monitors belongs to the main
  // Node environment. A worker may only have used the pure selfTest path.
  for (DockAttachment *attachment in state->attachments.allValues) [attachment detach];
  [state->attachments removeAllObjects]; delete state;
}
static napi_value Initialize(napi_env env,napi_value exports) {
  Environment *state=new Environment; state->attachments=[NSMutableDictionary new];
  const napi_property_descriptor methods[]={
    {"attach",nullptr,Attach,nullptr,nullptr,nullptr,napi_default,state},
    {"start",nullptr,Start,nullptr,nullptr,nullptr,napi_default,state},
    {"cancel",nullptr,Cancel,nullptr,nullptr,nullptr,napi_default,state},
    {"dispose",nullptr,Dispose,nullptr,nullptr,nullptr,napi_default,state},
    {"selfTest",nullptr,SelfTest,nullptr,nullptr,nullptr,napi_default,state},
  };
  if (napi_define_properties(env,exports,5,methods)!=napi_ok
      || napi_add_env_cleanup_hook(env,Cleanup,state)!=napi_ok) { delete state; return Error(env,"DOCK_INIT_FAILED"); }
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
