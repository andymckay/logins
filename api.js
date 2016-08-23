
const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "loginManager",
                                   "@mozilla.org/login-manager;1",
                                   "nsILoginManager");
XPCOMUtils.defineLazyModuleGetter(this, "NetUtil",
                                  "resource://gre/modules/NetUtil.jsm");

function convert(info) {
  return {
    username: info.username,
    password: info.password,
    origin: info.hostname,
    formSubmitURL: info.formSubmitURL,
    realm: info.httpRealm,
    usernameField: info.usernameField,
    passwordField: info.passwordField,
  };
}

function accessible(context, info) {
  let url;
  try {
    url = NetUtil.newURI(info.hostname);
  } catch (ex) {
    // unparseable hostname, cnan this actually happen?
    return false;
  }

  if (url.scheme == "addon") {
    return (url.path == context.extension.id);
  } else if (url.scheme == "moz-extension") {
    return (url.host == context.extension.id
            || url.host == context.extension.uuid);
  } else {
    return (context.extension.whiteListedHosts.matches(url));
  }
}

class API extends ExtensionAPI {
  getAPI(context) {
    // XXX only return this for background contexts?
    return {
      logins: {
        search(options) {
          let logins = loginManager.getAllLogins()
              .filter(login => accessible(context, login))
              .map(convert)
              .filter(login => Object.keys(options)
                      .every(field => options[field] == null || login[field] == options[field]));

          return Promise.resolve(logins);
        }
      },

      store(info) {
        return Promise.reject("implement me");
      },

      remove(options) {
        return Promise.reject("implement me");
      },
    };
  }
}
