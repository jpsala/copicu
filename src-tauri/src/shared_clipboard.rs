//! Sharing candidates, explicitly opt-in and not initialized by app startup.
//! The pure effect model also serves the standalone native N1 harness; C1 adds
//! bounded crypto/custody/transport primitives, without authorizing native effects.

#[cfg(feature = "shared-clipboard")]
pub(crate) mod crypto;
#[cfg(feature = "shared-clipboard")]
pub(crate) mod custody;
#[cfg(feature = "shared-clipboard")]
pub(crate) mod enrollment;
#[cfg(all(test, feature = "shared-clipboard", windows))]
mod integration;
#[cfg(feature = "shared-clipboard")]
pub(crate) mod transport;
#[cfg(any(test, feature = "shared-clipboard"))]
pub(crate) mod wire;

pub(crate) mod model;
