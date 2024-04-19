use anchor_lang::prelude::error_code;

#[error_code]
pub enum SnipeHelperErrorCode {
  #[msg("invalid token amount checking input")]
  InvalidTokenAmountCheckingInput = 0,
  #[msg("invalid token amount")]
  InvalidTokenAmount = 1,
}
