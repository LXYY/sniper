use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace, Default)]
pub struct Snipe {
	// Nothing is needed but a bump. This is mainly for preventing double-snipe.
	pub bump: u8,
}