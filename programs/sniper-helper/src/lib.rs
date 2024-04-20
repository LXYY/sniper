extern crate core;

use anchor_lang::prelude::*;

use instructions::*;

mod instructions;
declare_id!("3QHat3MhK9eq1hXdwpgpqUvpJr3fX5tiZ96NokS4T75c");

#[program]
pub mod sniper_helper {
  use super::*;

  pub fn init_snipe(ctx: Context<InitSnipe>) -> Result<()> {
    init_snipe::handler(ctx)
  }

  pub fn check_token_amount(
    ctx: Context<CheckTokenAmount>,
    min_amount: u64,
    max_amount: u64,
  ) -> Result<()> {
    check_token_amount::handler(ctx, min_amount, max_amount)
  }
}
