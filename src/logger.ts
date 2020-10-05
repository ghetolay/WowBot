import { createLogger, format, transports } from "winston";

export const logger = createLogger({
    level: 'info',
    format: format.combine(
      format.timestamp({
        format: 'YYYY/MM/DD HH:mm:ss'
      }),
      format.errors({ stack: true }),
      format.splat(),
      format.json()
    ),
    defaultMeta: { service: 'Wow-planner' },
    transports: process.env.NODE_ENV === 'production' ? [
      //
      // - Write to all logs with level `info` and below to `quick-start-combined.log`.
      // - Write all logs error (and below) to `quick-start-error.log`.
      //
      new transports.File({ filename: 'quick-start-error.log', level: 'error' }),
      new transports.File({ filename: 'quick-start-combined.log' })
    ] :
    [ new transports.Console({
        format: format.combine(
          format.colorize(),
          format.simple()
        )
      })
    ]
  });
