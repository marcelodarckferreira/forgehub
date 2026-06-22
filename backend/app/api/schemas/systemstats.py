"""System-stats domain schemas. See api/routes/systemstats.py."""
from pydantic import BaseModel


class MemoryStats(BaseModel):
    total_bytes: int
    used_bytes: int
    available_bytes: int
    percent_used: float


class DiskStats(BaseModel):
    total_bytes: int
    used_bytes: int
    free_bytes: int
    percent_used: float


class NetworkStats(BaseModel):
    interface: str | None
    rx_bytes: int
    tx_bytes: int


class SystemStatsOut(BaseModel):
    memory: MemoryStats
    disk: DiskStats
    network: NetworkStats
