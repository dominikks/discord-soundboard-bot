use serenity::client::Cache;
use serenity::client::Context;
use serenity::http::CacheHttp as SerenityCacheHttp;
use serenity::http::Http;
use serenity::CacheAndHttp;
use std::sync::Arc;

pub mod client;
mod commands;
pub mod management;
pub mod player;
pub mod recorder;

/// Instead of the built-in serenity struct, we use this
#[derive(Clone)]
pub struct CacheHttp {
  pub cache: Arc<Cache>,
  pub http: Arc<Http>,
}

impl SerenityCacheHttp for CacheHttp {
  fn http(&self) -> &Http {
    &self.http
  }
  fn cache(&self) -> Option<&Arc<Cache>> {
    Some(&self.cache)
  }
}

impl From<&Context> for CacheHttp {
  fn from(ctx: &Context) -> Self {
    CacheHttp {
      cache: ctx.cache.clone(),
      http: ctx.http.clone(),
    }
  }
}

impl From<&Arc<CacheAndHttp>> for CacheHttp {
  fn from(cachehttp: &Arc<CacheAndHttp>) -> Self {
    CacheHttp {
      cache: cachehttp.cache.clone(),
      http: cachehttp.http.clone(),
    }
  }
}

impl AsRef<Cache> for CacheHttp {
  fn as_ref(&self) -> &Cache {
    self.cache.as_ref()
  }
}
