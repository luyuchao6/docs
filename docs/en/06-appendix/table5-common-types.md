---
url: https://lingdongfangcheng.feishu.cn/wiki/W2g9w0bKUiXeePkjH4mcXxHdnqf
last_updated: "2026-02-06"
---

# Table 5 - Common Types (Units) Description

### **1. Common Types (Units) Description**

#### **2.1 Current (A)**

| Data Type | LSB | Actual (A) |  |
| --- | --- | --- | --- |
| `int8` | 1 | 1 |  |
| `int16` | 1 | 0.1 |  |
| `int32` | 1 | 0.001 |  |
| `float` | 1 | 1 |  |

#### **2.2 Voltage (V)**

| Data Type | LSB | Actual (V) |
| --- | --- | --- |
| `int8` | 1 | 0.5 |
| `int16` | 1 | 0.1 |
| `int32` | 1 | 0.001 |
| `float` | 1 | 1 |

#### **2.3 Torque (Nm)**

- **Actual Torque = k * tqe**

**k Coefficient Table**

| Motor Model | Torque Coefficient |
| --- | --- |
| M3536_32 | 0.458105 |
| M4438_30 | 0.5256 |
| M4438_32 | 0.485565 |
| M4538_19 | 0.493835 |
| M5043_20 | 0.966 |
| M5046_20 | 0.533654 |
| M5047_09 | 0.547474 |
| M5047_36 | 0.64 |
| M6056_36 | 0.677 |
| M7256_35 | 0.676524 |
| M60SG_35 | 0.7942 |
| M60BM_35 | 0.7942 |

**Torque Conversion**

| Data Type | LSB | Actual (N*M) |
| --- | --- | --- |
| `int8` | 1 | 0.5 |
| `int16` | 1 | 0.01 |
| `int32` | 1 | 0.001 |
| `float` | 1 | 1 |

#### **2.4 Temperature (℃)**

| Data Type | LSB | Actual (℃) |
| --- | --- | --- |
| `int8` | 1 | 1 |
| `int16` | 1 | 0.1 |
| `int32` | 1 | 0.001 |
| `float` | 1 | 1 |

#### **2.5 Time (s)**

| Data Type | LSB | Actual (s) |
| --- | --- | --- |
| `int8` | 1 | 0.01 |
| `int16` | 1 | 0.001 |
| `int32` | 1 | 0.000001 |
| `float` | 1 | 1 |

#### **2.6 Position (revolutions)**

| Data Type | LSB | Actual (rev) | Actual (°) |
| --- | --- | --- | --- |
| `int8` | 1 | 0.01 | 3.6 |
| `int16` | 1 | 0.0001 | 0.036 |
| `int32` | 1 | 0.00001 | 0.0036 |
| `float` | 1 | 1 | 360 |

#### **2.7 Velocity (rev/s)**

| Data Type | LSB | Actual (rev/s) |
| --- | --- | --- |
| `int8` | 1 | 0.01 |
| `int16` | 1 | 0.00025 |
| `int32` | 1 | 0.00001 |
| `float` | 1 | 1 |

#### **2.8 Acceleration (rev/s^2)**

| Data Type | LSB | Actual (rev/s^2) |
| --- | --- | --- |
| `int8` | 1 | 0.05 |
| `int16` | 1 | 0.001 |
| `int32` | 1 | 0.00001 |
| `float` | 1 | 1 |

#### **2.9 PWM Scale (unitless)**

| Data Type | LSB | Actual |
| --- | --- | --- |
| `int8` | 1 | 1/127 - 0.007874 |
| `int16` | 1 | 1/32767 - 0.000030519 |
| `int32` | 1 | (1/2147483647) - 4.657^10 |
| `float` | 1 | 1 |

#### **2.10 rKp, rKd Scale (unitless, for registers 0x23 and 0x24)**

| Data Type | LSB | Actual |
| --- | --- | --- |
| `int8` | 1 | 1/127 - 0.007874 |
| `int16` | 1 | 1/32767 - 0.000030519 |
| `int32` | 1 | (1/2147483647) - 4.657^10 |
| `float` | 1 | 1 |

#### **2.11 Kp, Kd Scale (unitless, used in example code)**

| Data Type | LSB | Actual |
| --- | --- | --- |
| `int8` | 1 | 1 |
| `int16` | 1 | 0.1 |
| `int32` | 1 | 0.001 |
| `float` | 1 | 1 |
