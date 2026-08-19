import type { GarmentRepository } from "../../store/garment-repo.js";
import type { ProfileRepository } from "../../store/profile-repo.js";
import type { ProposalRepository } from "../../store/proposal-repo.js";

export interface ApiContext {
  readonly garments: GarmentRepository;
  readonly profiles: ProfileRepository;
  readonly proposals: ProposalRepository;
}
