import config from '../config';
import backendInfo from '../api/backend-info';
import axios, { AxiosResponse } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import * as https from 'https';
import { Common } from '../api/common';
import logger from '../logger';

/** @asyncSafe */
export async function $sync(path, sanityCheckCb?: (results: any, path: string) => any): Promise<{ data?: any, exists: boolean, server?: string }> {
  // start with a random server so load is uniformly spread
  let allMissing = true;
  const results: any[] = [];
  const respondedServers: string[] = [];
  const servers = [...config.REPLICATION.SERVERS];
  Common.shuffleArray(servers);
  for (const server of servers) {
    // don't query ourself
    if (server === backendInfo.getBackendInfo().hostname) {
      continue;
    }

    try {
      const result = await query(`https://${server}${path}`);
      if (result) {
        if (sanityCheckCb === undefined) {
          return { data: result, exists: true, server };
        }
        results.push(result);
        respondedServers.push(server);
        if (results.length >= 4) {
          const sanitizedResult = sanityCheckCb(results, path);
          if (sanitizedResult.length > 0) {
            return { data: sanitizedResult, exists: true, server: respondedServers[results.indexOf(sanitizedResult)] };
          } else {
            results.length = 0;
            respondedServers.length = 0;
          }
        }
      }
    } catch (e: any) {
      if (e?.response?.status === 404) {
        // this server is also missing this data
      } else {
        // something else went wrong
        allMissing = false;
      }
    }
  }

  if (sanityCheckCb !== undefined && results.length > 0) {
    logger.warn(`Only ${results.length} trusted servers responded to ${path} without agreement, skipping`, 'Replication');
  }

  return { exists: !allMissing };
}

/** @asyncUnsafe */
export async function query(path): Promise<object> {
  type axiosOptions = {
    headers: {
      'User-Agent': string
    };
    timeout: number;
    httpsAgent?: https.Agent;
  };
  const axiosOptions: axiosOptions = {
    headers: {
      'User-Agent': (config.MEMPOOL.USER_AGENT === 'mempool') ? `mempool/v${backendInfo.getBackendInfo().version}` : `${config.MEMPOOL.USER_AGENT}`
    },
    timeout: config.SOCKS5PROXY.ENABLED ? 30000 : 10000
  };

  if (config.SOCKS5PROXY.ENABLED) {
    const socksOptions = {
      agentOptions: {
        keepAlive: true,
      },
      hostname: config.SOCKS5PROXY.HOST,
      port: config.SOCKS5PROXY.PORT,
      username: config.SOCKS5PROXY.USERNAME || 'circuit0',
      password: config.SOCKS5PROXY.PASSWORD,
    };

    axiosOptions.httpsAgent = new SocksProxyAgent(socksOptions);
  }

  const data: AxiosResponse = await axios.get(path, axiosOptions);
  if (data.statusText === 'error' || !data.data) {
    throw new Error(`${data.status}`);
  }
  return data.data;
}