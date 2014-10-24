"use strict";

/*
 * version: 0.0.5
 * updated: 
 *  当 DOM Inspector 未安装时，如果查找的是 WEB 中的元素，将尝试：
 *      当安装装了 Firebug，将使用 Firebug 来定位元素的 DOM 位置；
 *      否则尝试通过 Firefox 自带的（仅支持 Firefox 17+）Inspector 来定位元素。
 */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/PopupNotifications.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

var InspectElement = {
    disabled: true,
    ww: Services.ww,       // nsIWindowWatcher
    wm: Services.wm,       // nsIWindowMediator

    get isWinNT() {
        var os = Services.appinfo.OS;
        return os == "WINNT" ? true : false;
    },

    handleEvent: function(e) {
        // Shift + 右键 响应
        if (!e.shiftKey || e.button != 2) return;
        e.stopPropagation();
        e.preventDefault();
        if (e.type != "click") return;
        var elem = e.originalTarget;
        //if (this.disabled) return this.error();
        var win = e.currentTarget;
        if (!this.disabled) {
            win.openDialog("chrome://inspector/content/", "_blank",
                           "chrome, all, dialog=no", elem);
        } else {
            try {
                if (win.Firebug) {
                    let Firebug = win.Firebug;
                    (function (elem, Firebug) {
                        Firebug.browserOverlay.startFirebug(function (Firebug) {
                            Firebug.Inspector.inspectFromContextMenu(elem);
                        });
                    })(e.target, Firebug);
                } else {
                    (function (elem) {
                        /*
                         * 有这么变的吗，四个版本，变了三次地址！！！
                         */
                        let devtools = {};
                        let version = Services.appinfo.version.split(".")[0];
                        let DEVTOOLS_URI;
                        if (version >= 24) {
                            DEVTOOLS_URI = "resource://gre/modules/devtools/Loader.jsm";
                            ({devtools} = Cu.import(DEVTOOLS_URI, {}));
                        } else if (version < 24 && version >= 23) {
                            DEVTOOLS_URI = "resource:///modules/devtools/gDevTools.jsm";
                            ({devtools} = Cu.import(DEVTOOLS_URI, {}));
                        } else if (version < 23 && version >= 20) {
                            DEVTOOLS_URI = "resource:///modules/devtools/Target.jsm";
                            devtools = Cu.import(DEVTOOLS_URI, {});
                        } else {
                            return (function (elem, InspectorUI) {
                                if (InspectorUI.isTreePanelOpen) {
                                    InspectorUI.inspectNode(elem);
                                    InspectorUI.stopInspecting();
                                } else {
                                    InspectorUI.openInspectorUI(elem);
                                }
                            })(e.target, win.InspectorUI);
                        }
                        let gBrowser = win.gBrowser, gDevTools = win.gDevTools;
                        let tt = devtools.TargetFactory.forTab(gBrowser.selectedTab);
                        return gDevTools.showToolbox(tt, "inspector").then((function (elem) {
                            return function(toolbox) {
                                let inspector = toolbox.getCurrentPanel();
                                inspector.selection.setNode(elem, "Extension-Element-Inspector");
                            }
                        })(e.target));
                    })(elem);
                }
            } catch (ex) {
                this.error();
            }
        }
        this.closePopup(elem, win);
    },
    closePopup: function (elem, win) {
        var parent = elem.parentNode;
        var list = [];
        while (parent != win && parent != null) {
            if (parent.localName == "menupopup" || parent.localName == "popup") {
                list.push(parent);
            }
            parent = parent.parentNode;
        }
        var len = list.length;
        if (!len) return;
        list[len - 1].hidePopup();
    },

    aListener: {
        onOpenWindow: function (aWindow) {
            var win = aWindow.docShell.QueryInterface(
                      Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow);
            win.addEventListener("load", function _() {
                this.removeEventListener("load", _, false);
                win.addEventListener("click", InspectElement, true);
                // fix context menu bug in linux
                if (InspectElement.isWinNT) return;
                //win.addEventListener("mousedown", InspectElement, true);
                win.addEventListener("mouseup", InspectElement, false);
                win.addEventListener("contextmenu", InspectElement, true);
            }, false);
        },
        onCloseWindow: function (aWindow) {},
        onWindowTitleChange: function (aWindow, aTitle) {},
    },

    startup: function () {
        this.wm.addListener(this.aListener);
        var cw = this.ww.getWindowEnumerator();
        while (cw.hasMoreElements()) {
            var win = cw.getNext().QueryInterface(Ci.nsIDOMWindow);
            win.addEventListener("click", InspectElement, true);
            // fix context menu bug in linux
            if (this.isWinNT) continue;
            //win.addEventListener("mousedown", InspectElement, true);
            win.addEventListener("mouseup", InspectElement, false);
            win.addEventListener("contextmenu", InspectElement, true);
        }
        var that = this;
        var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        timer.initWithCallback(function () {
            AddonManager.getAllAddons(function (addons) {
                for (let i in addons) {
                    if (addons[i].id == "inspector@mozilla.org" && addons[i].isActive) {
                        that.disabled = false;
                        break;
                    }
                }
            });
        }, 500, Ci.nsITimer.TYPE_ONE_SHOT);
    },
    shutdown: function () {
        this.wm.removeListener(this.aListener);
        var cw = this.ww.getWindowEnumerator();
        while (cw.hasMoreElements()) {
            var win = cw.getNext().QueryInterface(Ci.nsIDOMWindow);
            win.removeEventListener("click", InspectElement, true);
            if (this.isWinNT) continue;
            //win.removeEventListener("mousedown", InspectElement, true);
            win.removeEventListener("mouseup", InspectElement, false);
            win.removeEventListener("contextmenu", InspectElement, true);
        }
    },

    observe: function (subject, topic, data) {
        if (topic == "alertclickcallback" && data == "link") {
            var win = this.wm.getMostRecentWindow("navigator:browser");
            var url = 'https://addons.mozilla.org/en-US/firefox/addon/dom-inspector-6622/';
            if (win && win.gBrowser) {
                win.gBrowser.loadOneTab(url, null, null, null, false, false);
            } else {
                this.ww.openWindow(win ? win : null, url, win.name, null, null);
            }
        }
    },
    error: function () {
        var et = "The addon require DOM Inspector! " + 
                 "Please install or enable the addon.";
        var as = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
        as.showAlertNotification("chrome://global/skin/icons/Error.png",
                                 "Error:", et, true, "link", this,
                                 "InspectElementError"); 
        return;
    }
}

// 启用
function startup(data, reason) {
    InspectElement.startup();
}

// 禁用或应用程序退出
function shutdown(data, reason) {
    InspectElement.shutdown();
}

// 安装
function install(data, reason) {
}

// 卸载
function uninstall(data, reason) {
}
