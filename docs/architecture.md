# System Architecture

## High-level flow

```text
User / Fleet Manager
  |
  v
Frontend (Vercel Dashboard)
  |
  v
Edge-AI Module
  |
  +---------------------> Warehouse Traffic Dataset
  |
  v
Machine Learning Model
  |
  v
Prediction / Route Penalty
  |
  v
Frontend (Dashboard Updates AMR Routes)
```

# Components
## Frontend
Handles user interaction, live fleet monitoring, and display of congested routes across the warehouse floor.

## Backend / Edge Module
Processes real-time AMR data, calculates route penalties, and coordinates application logic to avoid robot collisions (including offline distributed coordination).

## Machine Learning Model
Processes the input data (synthetic warehouse traffic) and generates a prediction for future bottlenecks.

## Database / Storage
Stores synthetic training data (warehouse_traffic_data_v2.csv) and the trained predictive model (congestion_model.pkl).
