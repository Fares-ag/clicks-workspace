import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/theme/app_colors.dart';

class FinanceScreen extends StatefulWidget {
  const FinanceScreen({super.key});

  @override
  State<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends State<FinanceScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await DioHelper.getData(url: EndPoints.financeOverview);
      if (res.statusCode == 200 && res.data is Map) {
        setState(() {
          _data = Map<String, dynamic>.from(res.data as Map);
          _loading = false;
        });
      } else {
        setState(() {
          _error = DioHelper.errorMessage(res) ?? 'Failed to load finance';
          _loading = false;
        });
      }
    } catch (_) {
      setState(() {
        _error = 'Failed to load finance';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat('#,##0', 'en_US');
    return Scaffold(
      appBar: AppBar(title: const Text('Finance overview')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _Card(
                        'Total revenue',
                        '${money.format(_data?['totalRevenue'] ?? 0)} QAR',
                      ),
                      _Card(
                        'Pending payouts',
                        '${money.format(_data?['pendingPayouts'] ?? 0)} QAR',
                      ),
                      _Card(
                        'Completed jobs',
                        '${_data?['completedJobs'] ?? 0}',
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: GoogleFonts.dmSans(color: AppColors.muted)),
          const SizedBox(height: 4),
          Text(
            value,
            style: GoogleFonts.dmSans(fontSize: 22, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
