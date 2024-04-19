use anchor_lang::prelude::*;
use anchor_spl::token::{TokenAccount};

use crate::errors::SnipeHelperErrorCode;

#[derive(Accounts)]
#[instruction(
  min_amount: u64,
  max_amount: u64,
)]
pub struct CheckTokenAmount<'info> {
  #[account(
     constraint = min_amount <= max_amount @SnipeHelperErrorCode::InvalidTokenAmountCheckingInput,
     constraint = token_account.amount >= min_amount && token_account.amount <= max_amount @SnipeHelperErrorCode::InvalidTokenAmount,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  _ctx: Context<CheckTokenAmount>,
  _min_amount: u64,
  _max_amount: u64,
) -> Result<()> {
  Ok(())
}
